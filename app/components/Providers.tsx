'use client';

import SessionProvider from './SessionProvider';
import { NotificationProvider } from '@/app/context/NotificationContext';
import { CategoryProvider } from '@/app/context/CategoryContext';
import { AppNotificationProvider } from '@/app/context/AppNotificationContext';
import { StatusProvider } from '@/app/context/StatusContext';
import { SocketProvider } from '@/app/context/SocketContext';

import { Toaster } from 'react-hot-toast';

/**
 * ครอบ providers ทั้งหมด (เทียบการรวม Context เก่าใน frontend)
 * ลำดับ: Session → Toast → Category → AppNotification → Status → Socket
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NotificationProvider>
        <CategoryProvider>
          <AppNotificationProvider>
            <StatusProvider>
              <SocketProvider>
                {children}
                <Toaster position="top-center" reverseOrder={false} />
              </SocketProvider>
            </StatusProvider>
          </AppNotificationProvider>
        </CategoryProvider>
      </NotificationProvider>
    </SessionProvider>
  );
}
