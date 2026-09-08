'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getTabsForRole, type TabItem } from '@/lib/auth-constants';
import { adminMenuItems } from '@/lib/admin-menu';
import { useState, useEffect, memo } from 'react';
import { useSidebar } from '@/app/context/SidebarContext';
import { useAppNotification } from '@/app/context/AppNotificationContext';
import { useCategories } from '@/app/context/CategoryContext';
import { createPortal } from 'react-dom';

type CategoryItem = { CategoryID: number; CategoryName: string };

// Tooltip component — ใช้ fixed position + portal เพื่อไม่โดน overflow-y-auto clip
function Tooltip({ children, text, show }: { children: React.ReactNode; text: string; show: boolean }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!show) return <>{children}</>;

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
    setVisible(true);
  };

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={() => setVisible(false)}>
      {children}
      {mounted && visible && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateY(-50%)', zIndex: 9999 }}
          className="px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap shadow-lg pointer-events-none"
        >
          {text}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>,
        document.body
      )}
    </div>
  );
}

type SidebarNavLinkProps = {
  tab: TabItem;
  pathname: string | null;
  isCollapsed: boolean;
  showText: boolean;
  pendingCount: number;
  closeMobile: () => void;
};

function SidebarNavLink({ tab, pathname, isCollapsed, showText, pendingCount, closeMobile }: SidebarNavLinkProps) {
  const isActive = pathname === tab.path || (tab.path !== '/welcome' && pathname?.startsWith(tab.path));
  const iconPaths: Record<string, string> = {
    '/dashboard': 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6',
    '/pending-tasks': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    '/request/new': 'M12 4v16m8-8H4',
    '/report': 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    '/profile': 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  };
  const iconPath = iconPaths[tab.path] ?? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';

  return (
    <Tooltip text={tab.label} show={isCollapsed}>
      <Link
        href={tab.path}
        onClick={closeMobile}
        className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-3.5'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-semibold transition-all duration-200 group ${isActive
          ? 'bg-blue-50 text-blue-700 shadow-sm'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
        <svg className={`w-5 h-5 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>
        {showText && <span className="flex-1 text-left">{tab.label}</span>}
        {tab.path === '/pending-tasks' && pendingCount > 0 && (
          <span className={`flex h-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white px-1.5 min-w-[20px] ${isCollapsed ? 'absolute -top-1 -right-1 ring-2 ring-white' : ''}`}>
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}

function SidebarCategoryMenu({ categories, pathname, isCollapsed, showText, categoriesOpen, setCategoriesOpen, closeMobile }: {
  categories: CategoryItem[];
  pathname: string | null;
  isCollapsed: boolean;
  showText: boolean;
  categoriesOpen: boolean;
  setCategoriesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeMobile: () => void;
}) {
  if (categories.length === 0) return null;

  return (
    <div className="pt-1">
      <Tooltip text="หมวดหมู่คำร้อง" show={isCollapsed}>
        <button
          type="button"
          onClick={() => setCategoriesOpen((open) => !open)}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-2.5'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-semibold transition-colors group ${pathname?.startsWith('/category')
            ? 'bg-gray-50 text-gray-900'
            : 'text-gray-600 hover:bg-gray-50'
            }`}
        >
          <div className={`flex items-center ${isCollapsed ? '' : 'gap-3.5'}`}>
            <svg className={`w-5 h-5 transition-colors ${pathname?.startsWith('/category') ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            {showText && <span>หมวดหมู่คำร้อง</span>}
          </div>
          {showText && (
            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${categoriesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
      </Tooltip>
      {categoriesOpen && !isCollapsed && (
        <div className="mt-2 space-y-1 pl-2">
          {categories.map((category) => {
            const isActive = pathname === `/category/${category.CategoryID}`;
            return (
              <Link
                key={category.CategoryID}
                href={`/category/${category.CategoryID}`}
                onClick={closeMobile}
                className={`block rounded-lg px-4 py-2.5 text-sm transition-all relative ${isActive
                  ? 'text-primary-700 font-semibold bg-primary-50 ml-2'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 ml-2'
                  }`}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary-500 rounded-r-full" />}
                {category.CategoryName}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UnifiedUserNavigation({ tabs, categories, pathname, isCollapsed, showText, pendingCount, categoriesOpen, setCategoriesOpen, closeMobile }: {
  tabs: TabItem[];
  categories: CategoryItem[];
  pathname: string | null;
  isCollapsed: boolean;
  showText: boolean;
  pendingCount: number;
  categoriesOpen: boolean;
  setCategoriesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeMobile: () => void;
}) {
  const homeTab: TabItem = { label: 'หน้าแรก', path: '/dashboard', displayOrder: 0 };
  const workplaceTabs = tabs.filter((tab) => tab.path !== '/dashboard');

  return (
    <>
      <div className="space-y-2">
        {showText && <div className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Main Menu</div>}
        <SidebarNavLink tab={homeTab} pathname={pathname} isCollapsed={isCollapsed} showText={showText} pendingCount={pendingCount} closeMobile={closeMobile} />
        <SidebarCategoryMenu categories={categories} pathname={pathname} isCollapsed={isCollapsed} showText={showText} categoriesOpen={categoriesOpen} setCategoriesOpen={setCategoriesOpen} closeMobile={closeMobile} />
      </div>
      <div className="space-y-2">
        {showText && <div className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Workplace</div>}
        {workplaceTabs.map((tab) => (
          <SidebarNavLink key={tab.path} tab={tab} pathname={pathname} isCollapsed={isCollapsed} showText={showText} pendingCount={pendingCount} closeMobile={closeMobile} />
        ))}
      </div>
    </>
  );
}

function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isCollapsed, toggleCollapse, closeMobile } = useSidebar();

  const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
  const tabs = getTabsForRole(roleName).filter((t) => t.path !== '/' && t.path !== '/welcome');
  const isAdminPath = pathname?.startsWith('/admin');
  const [adminOpen, setAdminOpen] = useState(isAdminPath);
  const [categoriesOpen, setCategoriesOpen] = useState(() => pathname?.startsWith('/category'));
  const { pendingCount } = useAppNotification();

  // ใช้ categories จาก CategoryContext ที่ fetch มาแล้ว — ไม่ต้อง fetch ซ้ำ
  const { categories: categoriesFromCtx } = useCategories();
  const categories = categoriesFromCtx.map((c) => ({ CategoryID: c.CategoryID, CategoryName: c.CategoryName }));

  useEffect(() => {
    if (isAdminPath) setAdminOpen(true);
  }, [isAdminPath]);
  useEffect(() => {
    if (pathname?.startsWith('/category')) setCategoriesOpen(true);
  }, [pathname]);

  // Close mobile menu when navigating
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  const sidebarWidth = isCollapsed ? 'w-20' : 'w-72';
  const showText = !isCollapsed;

  return (
    <aside className={`print:hidden fixed left-0 top-0 z-40 h-screen ${sidebarWidth} bg-white border-r border-gray-100 shadow-2xl shadow-gray-200/50 flex flex-col transition-[width] duration-200 ease-out`}>
      {/* Header Section */}
      <div className={`relative ${isCollapsed ? 'h-[104px] px-2 pb-12 pt-3' : 'min-h-[116px] px-4 pb-4 pt-3'} border-b border-gray-100 bg-gradient-to-b from-blue-50/40 to-white flex flex-col items-center justify-center`}>
        <Link href="/dashboard" className="flex flex-col items-center group w-full" onClick={closeMobile}>
          {/* Logo */}
          <div className="flex justify-center">
            <img
              src="/tsmlogo.png"
              alt="TSM Logo"
              className={`${isCollapsed ? 'w-8' : 'w-36'} h-auto object-contain drop-shadow-sm group-hover:scale-105 transition-all duration-300`}
            />
          </div>

          {/* Text - hidden when collapsed */}
          {showText && (
            <h1 className="mt-2 text-[15px] font-bold leading-tight text-blue-800 group-hover:text-blue-600 transition-colors text-center whitespace-nowrap">
              ระบบขอแก้ไขข้อมูลออนไลน์
            </h1>
          )}
        </Link>

        {/* Sidebar Toggle Button */}
        <button
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'ขยายเมนูด้านข้าง' : 'ย่อเมนูด้านข้าง'}
          className="hidden md:flex absolute -right-4 bottom-3 z-50 items-center justify-center h-9 w-9 p-0 rounded-r-xl rounded-l-lg text-gray-500 border border-gray-200/90 bg-white shadow-md shadow-gray-300/40 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all duration-200"
          title={isCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        >
          <svg className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-4'} py-6 space-y-6 scrollbar-hide`}>
        {/* Navigation Logic: Admin vs User */}
        {roleName === 'Admin' ? (
          <>
            {/* --- Admin View: Separated Sections --- */}

            {/* Main Menu Group (Admin) */}
            <div className="space-y-2">
              {showText && (
                <div className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Main Menu
                </div>
              )}

              <Tooltip text="หน้าแรก" show={isCollapsed}>
                <Link
                  href="/dashboard"
                  onClick={closeMobile}
                  className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-3.5'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-semibold transition-all duration-200 group ${pathname === '/dashboard' || pathname === '/'
                    ? 'bg-blue-50 text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full transition-opacity duration-200 ${pathname === '/dashboard' || pathname === '/' ? 'opacity-100' : 'opacity-0'}`} />

                  <svg className={`w-5 h-5 transition-colors ${pathname === '/dashboard' || pathname === '/' ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  {showText && <span>หน้าแรก</span>}
                </Link>
              </Tooltip>

              {/* Categories Section (Admin) */}
              {categories.length > 0 && (
                <div className="pt-1">
                  <Tooltip text="หมวดหมู่คำร้อง" show={isCollapsed}>
                    <button
                      type="button"
                      onClick={() => setCategoriesOpen((o) => !o)}
                      className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-2.5'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-semibold transition-colors group ${pathname?.startsWith('/category')
                        ? 'bg-gray-50 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      <div className={`flex items-center ${isCollapsed ? '' : 'gap-3.5'}`}>
                        <svg className={`w-5 h-5 transition-colors ${pathname?.startsWith('/category') ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        {showText && <span>หมวดหมู่คำร้อง</span>}
                      </div>
                      {showText && (
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${categoriesOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                  </Tooltip>

                  {categoriesOpen && !isCollapsed && (
                    <div className="mt-2 space-y-1 pl-2">
                      {categories.map((c) => {
                        const isActive = pathname === `/category/${c.CategoryID}`;
                        return (
                          <Link
                            key={c.CategoryID}
                            href={`/category/${c.CategoryID}`}
                            onClick={closeMobile}
                            className={`block rounded-lg px-4 py-2.5 text-sm transition-all relative ${isActive
                              ? 'text-primary-700 font-semibold bg-primary-50 ml-2'
                              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 ml-2'
                              }`}
                          >
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary-500 rounded-r-full"></div>}
                            {c.CategoryName}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Workplace Group (Admin) */}
            <div className="space-y-2">
              {showText && (
                <div className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Workplace
                </div>
              )}
              {tabs.map((tab) => {
                const isActive = pathname === tab.path || (tab.path !== '/welcome' && pathname?.startsWith(tab.path));
                return (
                  <Tooltip key={tab.path} text={tab.label} show={isCollapsed}>
                    <Link
                      href={tab.path}
                      onClick={closeMobile}
                      className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-3.5'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-semibold transition-all duration-200 group ${isActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`} />

                      <svg className={`w-5 h-5 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {tab.path === '/dashboard' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />}
                        {tab.path === '/pending-tasks' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />}
                        {tab.path === '/request/new' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />}
                        {tab.path === '/report' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
                        {tab.path === '/profile' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />}
                        {!['/dashboard', '/pending-tasks', '/request/new', '/report', '/profile'].includes(tab.path) && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />}
                      </svg>
                      {showText && <span className="flex-1 text-left">{tab.label}</span>}
                      {tab.path === '/pending-tasks' && pendingCount > 0 && (
                        <span className={`flex h-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white px-1.5 min-w-[20px] ${isCollapsed ? 'absolute -top-1 -right-1 ring-2 ring-white' : ''}`}>
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      )}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* User/Requester View: same grouped layout as Admin */}
            <UnifiedUserNavigation
              tabs={tabs}
              categories={categories}
              pathname={pathname}
              isCollapsed={isCollapsed}
              showText={showText}
              pendingCount={pendingCount}
              categoriesOpen={categoriesOpen}
              setCategoriesOpen={setCategoriesOpen}
              closeMobile={closeMobile}
            />

          </>
        )}


        {/* Admin Section */}
        {roleName === 'Admin' && (
          <div className={`pt-4 mt-2 border-t border-gray-100 ${isCollapsed ? 'px-0' : ''}`}>
            {showText && (
              <div className="px-2 text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1">
                Administrator
              </div>
            )}
            <Tooltip text="ผู้ดูแลระบบ" show={isCollapsed}>
              <button
                type="button"
                onClick={() => setAdminOpen((o) => !o)}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-2'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-medium transition-colors group ${isAdminPath ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-amber-50 hover:text-amber-700'
                  }`}
              >
                <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
                  <svg className={`w-5 h-5 transition-colors ${isAdminPath ? 'text-amber-500' : 'text-gray-400 group-hover:text-amber-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {showText && <span>ผู้ดูแลระบบ</span>}
                </div>
                {showText && (
                  <svg
                    className={`w-4 h-4 transition-transform duration-200 ${adminOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
            </Tooltip>
            {adminOpen && !isCollapsed && (
              <div className="mt-1 ml-4 pl-4 border-l-2 border-amber-200 space-y-1">
                {adminMenuItems.map((item) => {
                  const isItemActive = pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={closeMobile}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${isItemActive
                        ? 'text-amber-800 bg-amber-50 font-semibold'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                      {item.text}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User Footer */}
      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-gray-100 bg-gray-50/50`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${isCollapsed ? 'p-1' : 'p-2'} rounded-xl hover:bg-white hover:shadow-sm transition-all cursor-default`}>
          <div className={`${isCollapsed ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'} rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-bold shadow-md flex-shrink-0`}>
            {session?.user?.name?.[0] ?? '?'}
          </div>
          {showText && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{session?.user?.name}</p>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <p className="text-xs text-gray-500 truncate" title={roleName}>{roleName ?? 'User'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default memo(AppSidebar);
