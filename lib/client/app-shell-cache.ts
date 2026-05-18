/**
 * Client-side dedupe สำหรับ /api/app/shell — Category + Notification ใช้ cache ชุดเดียวกัน
 */
export type ShellCategory = {
  CategoryID: number;
  CategoryName: string;
  RequiresCCSClosing?: boolean;
  locations?: { id: number; name: string }[];
};

export type ShellNotification = {
  NotificationID: number;
  Message: string;
  RequestID?: number;
  IsRead: boolean;
  CreatedAt: string;
};

export type AppShellData = {
  categories: ShellCategory[];
  notifications: ShellNotification[];
  unreadCount: number;
  pendingCount: number;
};

const TTL_MS = 45_000;
let cached: AppShellData | null = null;
let cachedAt = 0;
let inflight: Promise<AppShellData | null> | null = null;

export function invalidateAppShellCache() {
  cached = null;
  cachedAt = 0;
}

export function loadAppShell(force = false): Promise<AppShellData | null> {
  const now = Date.now();
  if (!force && cached && now - cachedAt < TTL_MS) {
    return Promise.resolve(cached);
  }
  if (!force && inflight) return inflight;

  inflight = fetch('/api/app/shell', { credentials: 'same-origin' })
    .then((res) => {
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('shell load failed');
      return res.json() as Promise<AppShellData>;
    })
    .then((data) => {
      if (data) {
        cached = data;
        cachedAt = Date.now();
      }
      return data;
    })
    .catch((err) => {
      console.error('loadAppShell', err);
      return cached;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
