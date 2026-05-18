'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

type SidebarContextType = {
    isCollapsed: boolean;
    isMobileOpen: boolean;
    toggleCollapse: () => void;
    openMobile: () => void;
    closeMobile: () => void;
};

// Default values for SSR and before hydration
const defaultContext: SidebarContextType = {
    isCollapsed: false,
    isMobileOpen: false,
    toggleCollapse: () => { },
    openMobile: () => { },
    closeMobile: () => { },
};

const SidebarContext = createContext<SidebarContextType>(defaultContext);

const STORAGE_KEY = 'sidebar-collapsed';

function readInitialCollapsed(): boolean {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return window.innerWidth >= 768 && window.innerWidth < 1024;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(readInitialCollapsed);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const toggleCollapse = useCallback(() => {
        setIsCollapsed((prev) => {
            const newValue = !prev;
            localStorage.setItem(STORAGE_KEY, String(newValue));
            return newValue;
        });
    }, []);

    const openMobile = useCallback(() => setIsMobileOpen(true), []);
    const closeMobile = useCallback(() => setIsMobileOpen(false), []);

    return (
        <SidebarContext.Provider value={{ isCollapsed, isMobileOpen, toggleCollapse, openMobile, closeMobile }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    return useContext(SidebarContext);
}
