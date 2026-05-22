import { DriverPresenceProvider } from '@/contexts/DriverPresenceContext';
import { DriverRealtimeProvider } from '@/contexts/DriverRealtimeContext';
import { useDriverMountLog } from '@/utils/driverMountLog';
import React, { type ReactNode } from 'react';

/** Single mount point for all driver-stack providers (realtime + presence). */
export function DriverShellProvider({ children }: { children: ReactNode }) {
  useDriverMountLog('DriverShellProvider');
  return (
    <DriverRealtimeProvider>
      <DriverPresenceProvider>{children}</DriverPresenceProvider>
    </DriverRealtimeProvider>
  );
}
