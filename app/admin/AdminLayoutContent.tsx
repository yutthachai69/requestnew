'use client';

import AppHeader from '@/app/components/AppHeader';
import AppSidebar from '@/app/components/AppSidebar';
import { SidebarProvider, useSidebar } from '@/app/context/SidebarContext';

function AdminLayoutFrame({ children }: { children: React.ReactNode }) {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
  const contentPadding = isCollapsed ? 'md:pl-20' : 'md:pl-72';

  return (
    <div className="h-screen overflow-hidden bg-gray-50 print:h-auto print:overflow-visible">
      <div className="hidden md:block print:hidden">
        <AppSidebar />
      </div>

      {isMobileOpen && (
        <div className="relative z-50 md:hidden print:hidden">
          <div className="fixed inset-0 bg-gray-900/70" onClick={closeMobile} />
          <div className="fixed inset-y-0 left-0 flex w-full max-w-[288px]">
            <div className="relative w-full">
              <button
                type="button"
                onClick={closeMobile}
                className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/90 text-gray-600 hover:bg-white hover:text-gray-900 shadow-lg transition-all"
                aria-label="ปิดเมนู"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <AppSidebar />
            </div>
          </div>
        </div>
      )}

      <div className={`flex h-screen flex-col pl-0 print:h-auto print:overflow-visible ${contentPadding}`}>
        <div className="print:hidden"><AppHeader /></div>
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-hide py-6 px-4">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminLayoutFrame>{children}</AdminLayoutFrame>
    </SidebarProvider>
  );
}
