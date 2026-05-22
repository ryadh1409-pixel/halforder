import { DriverShellProvider } from '@/contexts/DriverShellContext';
import { useSegments } from 'expo-router';
import React, { type ReactNode } from 'react';

/**
 * Mounts driver providers once for the whole `/(driver)` visit, above `app/(driver)/_layout`.
 * Survives tab changes inside the driver stack even if the tabs layout re-renders.
 */
export function DriverRouteShell({ children }: { children: ReactNode }) {
  const segments = useSegments();
  const inDriver = segments[0] === '(driver)';

  if (!inDriver) {
    return children;
  }

  return <DriverShellProvider>{children}</DriverShellProvider>;
}
