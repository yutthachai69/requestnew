'use client';

import {
  createContext,
  useContext,
  useMemo,
} from 'react';
import {
  STATUS_LIST,
  getStatusByCode as getByCode,
  getStatusNameByCode as getNameByCode,
  type StatusItem,
} from '@/lib/status-constants';

type StatusContextValue = {
  statuses: StatusItem[];
  loading: boolean;
  getStatusByCode: (code: string) => StatusItem | undefined;
  getStatusNameByCode: (code: string) => string;
  getStatusByLevel: (level: number) => StatusItem | undefined;
  refreshStatuses: () => void;
};

const StatusContext = createContext<StatusContextValue | null>(null);

export function useStatuses(): StatusContextValue {
  const ctx = useContext(StatusContext);
  if (!ctx) {
    return {
      statuses: STATUS_LIST,
      loading: false,
      getStatusByCode: getByCode,
      getStatusNameByCode: getNameByCode,
      getStatusByLevel: (level) => STATUS_LIST.find((s) => s.StatusLevel === level),
      refreshStatuses: () => {},
    };
  }
  return ctx;
}

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<StatusContextValue>(
    () => ({
      statuses: STATUS_LIST,
      loading: false,
      getStatusByCode: getByCode,
      getStatusNameByCode: getNameByCode,
      getStatusByLevel: (level) => STATUS_LIST.find((s) => s.StatusLevel === level),
      refreshStatuses: () => {},
    }),
    []
  );

  return (
    <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
  );
}
