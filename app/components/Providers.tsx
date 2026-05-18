'use client';

import SessionProvider from './SessionProvider';
import { NotificationProvider } from '@/app/context/NotificationContext';
import { AppShellProvider } from '@/app/context/AppShellContext';
import { StatusProvider } from '@/app/context/StatusContext';
import { SocketProvider } from '@/app/context/SocketContext';

import { Toaster } from 'react-hot-toast';

/**
 * ครอบ providers ทั้งหมด (เทียบการรวม Context เก่าใน frontend)
 * ลำดับ: Session → Toast → AppShell → Status → Socket
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NotificationProvider>
        <AppShellProvider>
          <StatusProvider>
            <SocketProvider>
              {children}
              <Toaster position="top-center" reverseOrder={false} />
            </SocketProvider>
          </StatusProvider>
        </AppShellProvider>
      </NotificationProvider>
    </SessionProvider>
  );
}
