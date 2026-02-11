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

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'true') {
            setIsCollapsed(true);
        } else if (stored === null) {
            // Check if tablet size on initial load
            const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
            if (isTablet) {
                setIsCollapsed(true);
            }
        }
    }, []);

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
