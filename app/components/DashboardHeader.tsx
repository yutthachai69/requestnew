'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';
import { getTabsForRole } from '@/lib/auth-constants';

export default function DashboardHeader() {
  const { data: session } = useSession();
  const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
  const tabs = getTabsForRole(roleName).filter((t) => t.path !== '/'); // ไม่แสดง "หน้าแรก" ใน nav หลัก

  return (
    <header className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900">ระบบติดตามคำร้องออนไลน์</h1>
        <p className="text-gray-500 mt-2">ภาพรวมสถานะใบงาน F07 ทั้งหมดในระบบ</p>
      </div>

      <nav className="flex items-center gap-4">
        {tabs.map((tab) => (
          <Link
            key={tab.path}
            href={tab.path}
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
          >
            {tab.label}
          </Link>
        ))}
        {roleName === 'Admin' && (
          <Link
            href="/admin"
            className="px-3 py-2 text-sm font-medium text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg border border-amber-200"
          >
            ผู้ดูแลระบบ
          </Link>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          ออกจากระบบ
        </button>
      </nav>
    </header>
  );
}
