'use client';

import AppSidebar from '@/app/components/AppSidebar';
import AppHeader from '@/app/components/AppHeader';
import { SidebarProvider, useSidebar } from '@/app/context/SidebarContext';
import SessionExpiryWarning from '@/app/components/SessionExpiryWarning';

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();

  // Dynamic padding based on sidebar state
  const contentPadding = isCollapsed ? 'md:pl-20' : 'md:pl-72';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar (Always visible on md+, hidden on mobile) */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>

      {/* Mobile Sidebar (Drawer) */}
      {isMobileOpen && (
        <div className="relative z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={closeMobile}
          />

          {/* Sidebar Container */}
          <div className="fixed inset-y-0 left-0 flex w-full max-w-[288px] animate-in slide-in-from-left duration-300">
            <div className="relative w-full">
              {/* Close button */}
              <button
                type="button"
                onClick={closeMobile}
                className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/90 text-gray-600 hover:bg-white hover:text-gray-900 shadow-lg transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <AppSidebar />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex flex-col min-h-screen pl-0 ${contentPadding} transition-all duration-300 ease-in-out`}>
        <AppHeader />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Session Expiry Warning — ไม่แสดงสำหรับ Admin */}
      <SessionExpiryWarning />
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <MainLayoutContent>{children}</MainLayoutContent>
    </SidebarProvider>
  );
}
