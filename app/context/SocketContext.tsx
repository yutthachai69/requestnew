'use client';

import { createContext, useContext } from 'react';

/**
 * Placeholder until backend supports Socket.IO.
 * คอมโพเนนต์ที่ใช้ useSocket() จะได้ socket === null และไม่ทำ real-time
 */
type SocketContextValue = null;

const SocketContext = createContext<SocketContextValue>(null);

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  return (
    <SocketContext.Provider value={null}>{children}</SocketContext.Provider>
  );
}
