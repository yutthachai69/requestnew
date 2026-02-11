'use client';

import { createContext, useContext, useCallback, useState } from 'react';

type Severity = 'success' | 'error' | 'warning' | 'info';

type ToastItem = { id: number; message: string; severity: Severity };

type NotificationContextValue = {
  showNotification: (message: string, severity?: Severity) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

let toastId = 0;

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    return {
      showNotification: (message: string, _severity: Severity = 'success') => {
        if (typeof window !== 'undefined') console.log('[Notification]', message);
      },
    };
  }
  return ctx;
}

const DURATION_MS = 4000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showNotification = useCallback((message: string, severity: Severity = 'success') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, severity }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </NotificationContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: number) => void }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none p-4 sm:p-0"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto relative flex items-start gap-3 rounded-xl p-4 shadow-xl border overflow-hidden transform transition-all duration-300 animate-[slideIn_0.3s_ease-out] hover:scale-[1.02] cursor-pointer ${t.severity === 'error'
              ? 'bg-white border-red-100 ring-1 ring-red-50'
              : t.severity === 'warning'
                ? 'bg-white border-amber-100 ring-1 ring-amber-50'
                : t.severity === 'info'
                  ? 'bg-white border-blue-100 ring-1 ring-blue-50'
                  : 'bg-white border-green-100 ring-1 ring-green-50'
            }`}
          onClick={() => onRemove(t.id)}
        >
          {/* Severity Icon */}
          <div className={`flex-shrink-0 mt-0.5 ${t.severity === 'error' ? 'text-red-500' :
              t.severity === 'warning' ? 'text-amber-500' :
                t.severity === 'info' ? 'text-blue-500' : 'text-green-500'
            }`}>
            {t.severity === 'success' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {t.severity === 'error' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {t.severity === 'warning' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {t.severity === 'info' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* Message */}
          <div className="flex-1">
            <p className={`text-sm font-semibold ${t.severity === 'error' ? 'text-red-900' :
                t.severity === 'warning' ? 'text-amber-900' :
                  t.severity === 'info' ? 'text-blue-900' : 'text-green-900'
              }`}>
              {t.severity === 'error' ? 'เกิดข้อผิดพลาด' :
                t.severity === 'warning' ? 'แจ้งเตือน' :
                  t.severity === 'info' ? 'ข้อมูล' : 'สำเร็จ'}
            </p>
            <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{t.message}</p>
          </div>

          {/* Close Button */}
          <button className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Progress Bar (Optional decoration) */}
          <div className={`absolute bottom-0 left-0 h-1 bg-current opacity-20 w-full animate-[shrink_4s_linear] origin-left ${t.severity === 'error' ? 'text-red-500' :
              t.severity === 'warning' ? 'text-amber-500' :
                t.severity === 'info' ? 'text-blue-500' : 'text-green-500'
            }`} />
        </div>
      ))}
    </div>
  );
}
