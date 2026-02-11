'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import Link from 'next/link';
import { useAppNotification } from '../context/AppNotificationContext';
import { useSidebar } from '../context/SidebarContext';

interface AppHeaderProps {
  onMenuClick?: () => void;
}

export default function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { data: session } = useSession();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useAppNotification();
  const { isCollapsed, toggleCollapse, openMobile } = useSidebar();

  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
  const fullName = session?.user?.name ?? (session?.user as { fullName?: string })?.fullName ?? 'ผู้ใช้';

  const profileLabel =
    roleName === 'Admin'
      ? 'โปรไฟล์แอดมิน'
      : roleName
        ? `โปรไฟล์ (${roleName})`
        : 'โปรไฟล์';

  const handleLogoutClick = () => {
    setProfileOpen(false);
    setConfirmOpen(true);
  };

  const handleConfirmLogout = () => {
    setConfirmOpen(false);
    signOut({ callbackUrl: '/' });
  };

  const handleNotifClick = (notif: typeof notifications[0]) => {
    markAsRead(notif.NotificationID);
    setNotifOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 bg-white/90 backdrop-blur-xl px-4 sm:px-6 shadow-sm border-b border-gray-200/50 transition-all">
        {/* Left: Menu Buttons */}
        <div className="flex-1 flex items-center gap-2">
          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => onMenuClick ? onMenuClick() : openMobile()}
            className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            title="เปิดเมนู"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>



          {/* Divider */}
          <div className="hidden md:block w-px h-6 bg-gray-200" />

          {/* Page Title - จัดกึ่งกลางหน้าจอ */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-sm font-bold text-gray-800 tracking-tight uppercase">
              ระบบขอแก้ไขข้อมูลออนไลน์
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* 🔔 Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setNotifOpen((o) => !o); setProfileOpen(false); }}
              className={`relative p-2.5 rounded-xl border transition-all duration-200 ${notifOpen
                ? 'bg-primary-50 border-primary-200 text-primary-600'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700'
                }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" aria-hidden onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-gray-100 bg-white shadow-xl shadow-gray-200/50 ring-1 ring-black/5 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-primary-50/50 to-transparent">
                    <h3 className="text-sm font-bold text-gray-900">การแจ้งเตือน</h3>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => { markAllAsRead(); }}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        อ่านทั้งหมด
                      </button>
                    )}
                  </div>

                  {/* Notification List */}
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                        <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <p className="text-sm">ไม่มีการแจ้งเตือน</p>
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((notif) => (
                        <Link
                          key={notif.NotificationID}
                          href={notif.RequestID ? `/request/${notif.RequestID}` : '#'}
                          onClick={() => handleNotifClick(notif)}
                          className={`block px-4 py-3 border-b border-gray-50 last:border-0 transition-colors ${notif.IsRead ? 'bg-white hover:bg-gray-50' : 'bg-primary-50/30 hover:bg-primary-50/50'
                            }`}
                        >
                          <div className="flex items-start gap-3">
                            {!notif.IsRead && (
                              <span className="mt-1.5 w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                            )}
                            <div className={!notif.IsRead ? '' : 'pl-5'}>
                              <p className={`text-sm ${notif.IsRead ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                                {notif.Message}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(notif.CreatedAt).toLocaleDateString('th-TH', {
                                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  {notifications.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
                      <Link
                        href="/notifications"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        ดูทั้งหมด →
                      </Link>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Profile Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setProfileOpen((o) => !o); setNotifOpen(false); }}
              className={`flex items-center gap-3 rounded-full pl-1.5 pr-4 py-1.5 border transition-all duration-200 ${profileOpen ? 'bg-primary-50 border-primary-200 ring-4 ring-primary-50' : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
            >
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                {session?.user?.name?.[0] ?? '?'}
              </div>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-xs font-bold text-gray-700 leading-tight">{fullName}</span>
                <span className="text-[10px] text-gray-500 leading-tight font-medium mt-0.5">{roleName ?? 'User'}</span>
              </div>
              <svg className={`hidden sm:block h-4 w-4 text-gray-400 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" aria-hidden onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl shadow-gray-200/50 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                  <div className="px-4 py-3 border-b border-gray-50">
                    <p className="text-sm font-semibold text-gray-900">{fullName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{profileLabel}</p>
                  </div>

                  <div className="p-2">
                    <button
                      type="button"
                      onClick={handleLogoutClick}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Confirm ออกจากระบบ */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-900/5 scale-100 transform transition-all">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center">ยืนยันการออกจากระบบ</h3>
            <p className="mt-2 text-sm text-center text-gray-500">คุณแน่ใจว่าต้องการออกจากระบบใช่หรือไม่?</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow-sm shadow-red-500/30 transition-all"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
