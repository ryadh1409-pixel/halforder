import { DriverStackGate } from '@/components/driver/DriverStackGate';
import { useDriverShellAccess } from '@/hooks/useDriverShellAccess';
import React from 'react';

export const unstable_settings = {
  initialRouteName: 'index',
};

/**
 * Passive driver shell — no navigation side effects.
 * Wrong-role recovery is handled by {@link StartupRedirectOrchestrator} at root.
 */
export default function DriverLayout() {
  const { canMountDriver } = useDriverShellAccess();

  if (!canMountDriver) {
    return null;
  }

  return <DriverStackGate />;
}
