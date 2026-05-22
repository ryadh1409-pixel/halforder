import { DriverPresenceProvider } from '@/contexts/DriverPresenceContext';
import { DriverRealtimeProvider } from '@/contexts/DriverRealtimeContext';
import React, { type ReactNode } from 'react';

/** Single mount point for all driver-stack providers (presence + realtime). */
export function DriverShellProvider({ children }: { children: ReactNode }) {
  return (
    <DriverPresenceProvider>
      <DriverRealtimeProvider>{children}</DriverRealtimeProvider>
    </DriverPresenceProvider>
  );
}
