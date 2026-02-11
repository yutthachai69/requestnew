'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export type CategoryItem = {
  CategoryID: number;
  CategoryName: string;
  RequiresCCSClosing?: boolean;
  locations?: { id: number; name: string }[];
};

type CategoryContextValue = {
  categories: CategoryItem[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const CategoryContext = createContext<CategoryContextValue | null>(null);

export function useCategories(): CategoryContextValue {
  const ctx = useContext(CategoryContext);
  if (!ctx) {
    return {
      categories: [],
      loading: false,
      refresh: async () => {},
    };
  }
  return ctx;
}

export function CategoryProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user) {
      setCategories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/master/categories');
      if (!res.ok) {
        setCategories([]);
        return;
      }
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch categories', err);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [session?.user, status]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const value: CategoryContextValue = {
    categories,
    loading,
    refresh: fetchCategories,
  };

  return (
    <CategoryContext.Provider value={value}>{children}</CategoryContext.Provider>
  );
}
