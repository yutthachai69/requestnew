'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getTabsForRole } from '@/lib/auth-constants';
import { adminMenuItems } from '@/lib/admin-menu';
import { useState, useEffect } from 'react';
import { useSidebar } from '@/app/context/SidebarContext';

type CategoryItem = { CategoryID: number; CategoryName: string };

// Tooltip component for collapsed mode
function Tooltip({ children, text, show }: { children: React.ReactNode; text: string; show: boolean }) {
  if (!show) return <>{children}</>;
  return (
    <div className="relative group">
      {children}
      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap shadow-lg">
        {text}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
      </div>
    </div>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isCollapsed, toggleCollapse, closeMobile } = useSidebar();

  const roleName = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
  const tabs = getTabsForRole(roleName).filter((t) => t.path !== '/' && t.path !== '/welcome');
  const isAdminPath = pathname?.startsWith('/admin');
  const [adminOpen, setAdminOpen] = useState(isAdminPath);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(() => pathname?.startsWith('/category'));

  useEffect(() => {
    if (isAdminPath) setAdminOpen(true);
  }, [isAdminPath]);
  useEffect(() => {
    if (pathname?.startsWith('/category')) setCategoriesOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/master/categories', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CategoryItem[]) => setCategories(Array.isArray(list) ? list : []))
      .catch(() => setCategories([]));
  }, [session]);

  // Close mobile menu when navigating
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  const sidebarWidth = isCollapsed ? 'w-20' : 'w-72';
  const showText = !isCollapsed;

  return (
    <aside className={`fixed left-0 top-0 z-40 h-screen ${sidebarWidth} bg-white border-r border-gray-100 shadow-2xl shadow-gray-200/50 flex flex-col transition-all duration-300 ease-in-out`}>
      {/* Header Section */}
      <div className={`relative py-4 ${isCollapsed ? 'px-2' : 'px-4'} border-b border-gray-100 bg-gradient-to-b from-blue-50/40 to-white flex flex-col items-center justify-center min-h-[88px]`}>
        <Link href="/dashboard" className="flex flex-col items-center group w-full" onClick={closeMobile}>
          {/* Logo */}
          <div className="flex justify-center">
            <img
              src="/tsmlogo.png"
              alt="TSM Logo"
              className={`${isCollapsed ? 'w-10' : 'w-36'} h-auto object-contain drop-shadow-sm group-hover:scale-105 transition-all duration-300`}
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
          className={`hidden md:flex items-center justify-center p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white/80 transition-all duration-200 
            ${isCollapsed
              ? 'mt-3 bg-gray-50 w-full'
              : 'absolute bottom-2 right-2 shadow-sm border border-gray-200/50 bg-white/50 backdrop-blur-sm'
            }`}
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
                  className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-3.5'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-semibold transition-all duration-200 group overflow-hidden ${pathname === '/dashboard' || pathname === '/'
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
                      className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-3.5'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-semibold transition-all duration-200 group overflow-hidden ${isActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`} />

                      <svg className={`w-5 h-5 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      {showText && <span>{tab.label}</span>}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* --- User/Requester View: Unified Simple List --- */}
            <div className="space-y-2">
              {tabs.map((tab) => {
                const isActive = pathname === tab.path || (tab.path !== '/welcome' && pathname?.startsWith(tab.path));
                return (
                  <Tooltip key={tab.path} text={tab.label} show={isCollapsed}>
                    <Link
                      href={tab.path}
                      onClick={closeMobile}
                      className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-3.5'} rounded-xl ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3'} text-sm font-semibold transition-all duration-200 group overflow-hidden ${isActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`} />

                      <svg className={`w-5 h-5 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {/* Icons mapping based on path */}
                        {tab.path === '/dashboard' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />}
                        {tab.path === '/pending-tasks' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />}
                        {tab.path === '/request/new' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />}
                        {tab.path === '/report' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
                        {tab.path === '/profile' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />}
                        {!['/dashboard', '/pending-tasks', '/request/new', '/report', '/profile'].includes(tab.path) && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                      </svg>
                      {showText && <span>{tab.label}</span>}
                    </Link>
                  </Tooltip>
                );
              })}

              {/* Categories Section (For User - Part of flow) */}
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
