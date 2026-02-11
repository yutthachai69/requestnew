'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '@/app/context/NotificationContext';

/**
 * Custom Hook สำหรับดึงข้อมูลจาก API (เทียบ frontend/src/hooks/useFetchData.js)
 * รองรับทั้งฟังก์ชันที่ return Promise<data> และ Promise<{ data }> (แบบ axios)
 *
 * @param apiFunc - ฟังก์ชันที่เรียก API (เช่น () => fetch('/api/users').then(r => r.json()))
 * @param initialData - ข้อมูลเริ่มต้น (ปกติเป็น array ว่าง หรือ object ตามประเภทข้อมูล)
 * @returns { data, loading, error, refresh, setData }
 */
export function useFetchData<T>(
  apiFunc: () => Promise<T | { data: T }>,
  initialData: T
): {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setData: React.Dispatch<React.SetStateAction<T>>;
} {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFunc()
      .then((result) => {
        const resolved =
          result != null && typeof result === 'object' && 'data' in result
            ? (result as { data: T }).data
            : (result as T);
        setData(resolved);
      })
      .catch((err: unknown) => {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ??
          (err instanceof Error ? err.message : 'Could not load data');
        setError(message);
        showNotification(message, 'error');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiFunc, showNotification]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData, setData };
}

export default useFetchData;
