import { DriverPresenceProvider } from '@/contexts/DriverPresenceContext';
import { DriverRealtimeProvider } from '@/contexts/DriverRealtimeContext';
import { useDriverMountLog } from '@/utils/driverMountLog';
import React, { type ReactNode } from 'react';

/** Single mount point for all driver-stack providers (presence + realtime). */
export function DriverShellProvider({ children }: { children: ReactNode }) {
  useDriverMountLog('DriverShellProvider');
  return (
    <DriverPresenceProvider>
      <DriverRealtimeProvider>{children}</DriverRealtimeProvider>
    </DriverPresenceProvider>
  );
}
