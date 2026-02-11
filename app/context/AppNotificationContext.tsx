'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { useSession } from 'next-auth/react';

export type AppNotificationItem = {
  NotificationID: number;
  Message: string;
  RequestID?: number;
  IsRead: boolean;
  CreatedAt: string;
};

type AppNotificationContextValue = {
  notifications: AppNotificationItem[];
  unreadCount: number;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AppNotificationContext = createContext<AppNotificationContextValue | null>(
  null
);

export function useAppNotification(): AppNotificationContextValue {
  const ctx = useContext(AppNotificationContext);
  if (!ctx) {
    return {
      notifications: [],
      unreadCount: 0,
      markAsRead: async () => { },
      markAllAsRead: async () => { },
      refresh: async () => { },
    };
  }
  return ctx;
}

/**
 * Stub until Notification model + API exist.
 * เมื่อมี GET /api/notifications, PATCH markAsRead, markAllAsRead แล้วให้เปลี่ยน fetch ภายใน
 */
export function AppNotificationProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);

  const fetchNotifications = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user) {
      setNotifications([]);
      return;
    }
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  }, [session?.user, status]);

  useEffect(() => {
    fetchNotifications();
    // Optional: Poll every 30s
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.NotificationID === id ? { ...n, IsRead: true } : n))
    );
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (e) { console.error(e); }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, IsRead: true })));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      });
    } catch (e) { console.error(e); }
  }, []);

  const unreadCount = notifications.filter((n) => !n.IsRead).length;

  const value: AppNotificationContextValue = {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };

  return (
    <AppNotificationContext.Provider value={value}>
      {children}
    </AppNotificationContext.Provider>
  );
}
