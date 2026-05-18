'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { useSession } from 'next-auth/react';
import {
  loadAppShell,
  invalidateAppShellCache,
  type ShellCategory,
  type ShellNotification,
} from '@/lib/client/app-shell-cache';

export type CategoryItem = ShellCategory;
export type AppNotificationItem = ShellNotification;

type CategoriesContextValue = {
  categories: CategoryItem[];
  loading: boolean;
  refresh: () => Promise<void>;
};

type NotificationsContextValue = {
  notifications: AppNotificationItem[];
  unreadCount: number;
  pendingCount: number;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const CategoriesContext = createContext<CategoriesContextValue | null>(null);
const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const loadedRef = useRef(false);

  const applyShell = useCallback((data: Awaited<ReturnType<typeof loadAppShell>>) => {
    if (!data) {
      setCategories([]);
      setNotifications([]);
      setPendingCount(0);
      setUnreadCount(0);
      return;
    }
    setCategories(data.categories);
    setNotifications(data.notifications);
    setPendingCount(data.pendingCount);
    setUnreadCount(data.unreadCount);
    loadedRef.current = true;
  }, []);

  const fetchShell = useCallback(
    async (force = false) => {
      if (status !== 'authenticated' || !session?.user) {
        setCategories([]);
        setNotifications([]);
        setPendingCount(0);
        setUnreadCount(0);
        setCategoriesLoading(false);
        loadedRef.current = false;
        return;
      }
      if (!loadedRef.current || force) {
        setCategoriesLoading(true);
      }
      const data = await loadAppShell(force);
      applyShell(data);
      setCategoriesLoading(false);
    },
    [session?.user, status, applyShell]
  );

  useEffect(() => {
    fetchShell();
  }, [fetchShell]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const tick = () => {
      if (document.visibilityState === 'visible') fetchShell();
    };

    const interval = setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && loadedRef.current) {
        fetchShell();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, fetchShell]);

  const refreshShell = useCallback(async () => {
    invalidateAppShellCache();
    await fetchShell(true);
  }, [fetchShell]);

  const markAsRead = useCallback(async (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.NotificationID === id ? { ...n, IsRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, IsRead: true })));
    setUnreadCount(0);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const categoriesValue = useMemo<CategoriesContextValue>(
    () => ({
      categories,
      loading: categoriesLoading,
      refresh: refreshShell,
    }),
    [categories, categoriesLoading, refreshShell]
  );

  const notificationsValue = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      pendingCount,
      markAsRead,
      markAllAsRead,
      refresh: refreshShell,
    }),
    [notifications, unreadCount, pendingCount, markAsRead, markAllAsRead, refreshShell]
  );

  return (
    <CategoriesContext.Provider value={categoriesValue}>
      <NotificationsContext.Provider value={notificationsValue}>
        {children}
      </NotificationsContext.Provider>
    </CategoriesContext.Provider>
  );
}

export function CategoryProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useCategories(): CategoriesContextValue {
  const ctx = useContext(CategoriesContext);
  if (!ctx) {
    return { categories: [], loading: false, refresh: async () => {} };
  }
  return ctx;
}

export function AppNotificationProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useAppNotification(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    return {
      notifications: [],
      unreadCount: 0,
      pendingCount: 0,
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      refresh: async () => {},
    };
  }
  return ctx;
}
