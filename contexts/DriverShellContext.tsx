import { logDriverLayoutState } from '@/utils/driverLifecycleLog';
import { useDriverMountLog } from '@/utils/driverMountLog';
import { usePathname, useSegments } from 'expo-router';
import { memo, useEffect, type ReactNode } from 'react';

type DriverShellProviderProps = { children: ReactNode };

function DriverShellProviderInner({ children }: DriverShellProviderProps) {
  const pathname = usePathname();
  const segments = useSegments();
  useDriverMountLog('DriverShellProvider');

  useEffect(() => {
    logDriverLayoutState({
      pathname,
      segments: segments as string[],
      routeGroup: '(driver)',
      role: 'driver',
      authReady: true,
      roleResolved: true,
      uid: null,
      providerReady: true,
      reason: 'DriverShellProvider-mounted',
    });
  }, [pathname, segments]);

  return children;
}

export const DriverShellProvider = memo(DriverShellProviderInner);
