'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface Notification {
    NotificationID: number;
    Message: string;
    RequestID?: number;
    IsRead: boolean;
    CreatedAt: string;
}

export default function NotificationsPage() {
    const { data: session } = useSession();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications', { credentials: 'same-origin' });
            if (!res.ok) return;
            const data = await res.json();
            setNotifications(data.notifications ?? []);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (session?.user) fetchNotifications();
    }, [session, fetchNotifications]);

    const markAsRead = async (id: number) => {
        await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        setNotifications((prev) =>
            prev.map((n) => (n.NotificationID === id ? { ...n, IsRead: true } : n))
        );
    };

    const markAllAsRead = async () => {
        await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true }),
        });
        setNotifications((prev) => prev.map((n) => ({ ...n, IsRead: true })));
    };

    const unreadCount = notifications.filter((n) => !n.IsRead).length;

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">การแจ้งเตือน</h1>
                        <p className="text-sm text-gray-500">
                            {unreadCount > 0 ? `${unreadCount} รายการยังไม่อ่าน` : 'อ่านทั้งหมดแล้ว'}
                        </p>
                    </div>
                </div>

                {unreadCount > 0 && (
                    <button
                        type="button"
                        onClick={markAllAsRead}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                        อ่านทั้งหมด
                    </button>
                )}
            </div>

            {/* Notification List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                        <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        กำลังโหลด...
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <svg className="w-16 h-16 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <p className="text-base font-medium text-gray-500">ไม่มีการแจ้งเตือน</p>
                        <p className="text-sm text-gray-400 mt-1">เมื่อมีอัปเดตเกี่ยวกับคำร้องจะแสดงที่นี่</p>
                    </div>
                ) : (
                    notifications.map((notif, idx) => (
                        <div
                            key={notif.NotificationID}
                            className={`flex items-start gap-4 px-5 py-4 transition-colors ${idx < notifications.length - 1 ? 'border-b border-gray-100' : ''
                                } ${notif.IsRead ? 'bg-white' : 'bg-blue-50/40'}`}
                        >
                            {/* Unread dot */}
                            <div className="mt-1.5 flex-shrink-0 w-3">
                                {!notif.IsRead && (
                                    <span className="block w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-100" />
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm ${notif.IsRead ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                                    {notif.Message}
                                </p>
                                <p className="text-xs text-gray-400 mt-1.5">
                                    {new Date(notif.CreatedAt).toLocaleDateString('th-TH', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {notif.RequestID && (
                                    <Link
                                        href={`/request/${notif.RequestID}`}
                                        className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        ดูคำร้อง
                                    </Link>
                                )}
                                {!notif.IsRead && (
                                    <button
                                        type="button"
                                        onClick={() => markAsRead(notif.NotificationID)}
                                        className="text-xs text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                                        title="ทำเครื่องหมายว่าอ่านแล้ว"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Back link */}
            <div className="mt-6 text-center">
                <Link
                    href="/dashboard"
                    className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    กลับหน้าภาพรวม
                </Link>
            </div>
        </div>
    );
}
