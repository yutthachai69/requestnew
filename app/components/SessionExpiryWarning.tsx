'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut, getSession } from 'next-auth/react';

const WARN_BEFORE_SECONDS = 5 * 60; // แจ้งเตือนก่อนหมด 5 นาที
const CHECK_INTERVAL_MS = 30 * 1000; // เช็คทุก 30 วินาที

export default function SessionExpiryWarning() {
    const { data: session, status } = useSession();
    const [showDialog, setShowDialog] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(WARN_BEFORE_SECONDS);
    const [extending, setExtending] = useState(false);

    const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
    const isAdmin = roleName === 'Admin';

    const checkSession = useCallback(async () => {
        if (isAdmin || status !== 'authenticated') return;

        // getSession() อ่านจาก cookie/jwt ไม่ยิง server request
        const s = await getSession();
        if (!s) {
            // Session หมดแล้ว → ออกเลย
            signOut({ callbackUrl: '/login' });
            return;
        }

        // Next-Auth เก็บ expires เป็น ISO string ใน session
        const expiresAt = new Date(s.expires).getTime();
        const now = Date.now();
        const remaining = Math.floor((expiresAt - now) / 1000); // วินาทีที่เหลือ

        if (remaining <= 0) {
            signOut({ callbackUrl: '/login' });
        } else if (remaining <= WARN_BEFORE_SECONDS) {
            setSecondsLeft(remaining);
            setShowDialog(true);
        } else {
            setShowDialog(false);
        }
    }, [isAdmin, status]);

    // เช็คทุก 30 วินาที
    useEffect(() => {
        if (isAdmin || status !== 'authenticated') return;
        checkSession();
        const interval = setInterval(checkSession, CHECK_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [checkSession, isAdmin, status]);

    // นับถอยหลังใน Dialog
    useEffect(() => {
        if (!showDialog) return;
        if (secondsLeft <= 0) {
            signOut({ callbackUrl: '/login' });
            return;
        }
        const timer = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    signOut({ callbackUrl: '/login' });
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [showDialog, secondsLeft]);

    const handleStay = async () => {
        setExtending(true);
        try {
            // Force refresh session token
            await fetch('/api/auth/session', { method: 'GET', credentials: 'include' });
            setShowDialog(false);
        } finally {
            setExtending(false);
        }
    };

    const handleLogout = () => {
        signOut({ callbackUrl: '/login' });
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    if (!showDialog) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900">เซสชันใกล้หมดอายุ</h3>
                        <p className="text-xs text-amber-600">คุณไม่ได้ใช้งานมาสักระยะหนึ่งแล้ว</p>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 text-center">
                    <p className="text-gray-600 text-sm mb-4">
                        เซสชันของคุณจะหมดอายุใน
                    </p>
                    <div className="text-5xl font-bold text-amber-500 font-mono mb-4 tracking-wider">
                        {formatTime(secondsLeft)}
                    </div>
                    <p className="text-gray-500 text-xs">
                        กด <span className="font-semibold text-blue-600">อยู่ต่อ</span> เพื่อต่ออายุเซสชัน
                        หรือจะออกจากระบบตอนนี้ก็ได้
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 flex gap-3">
                    <button
                        onClick={handleLogout}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        ออกจากระบบ
                    </button>
                    <button
                        onClick={handleStay}
                        disabled={extending}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
                    >
                        {extending ? 'กำลังต่ออายุ...' : 'อยู่ต่อ'}
                    </button>
                </div>
            </div>
        </div>
    );
}
