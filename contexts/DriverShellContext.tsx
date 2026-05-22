import { useAuth } from '@/services/AuthContext';
import { useDriverMountLog } from '@/utils/driverMountLog';
import React, { type ReactNode } from 'react';

/** Inner driver shell wrapper (tabs + screens). Presence/realtime wrap this from the layout. */
export function DriverShellProvider({ children }: { children: ReactNode }) {
  const uid = useAuth().user?.uid?.trim() ?? '';
  useDriverMountLog('DriverShellProvider', uid || null);
  return <>{children}</>;
}
