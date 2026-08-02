import { RouteGroupMonitor } from '@/components/RouteGroupMonitor';
import { DriverFallbackScreen } from '@/components/driver/DriverFallbackScreen';
import { DriverLiveSharingHost } from '@/components/driver/DriverLiveSharingHost';
import DriverTabsNavigator from '@/components/driver/DriverTabsNavigator';
import { DriverPresenceProvider } from '@/contexts/DriverPresenceContext';
import { DriverRealtimeProvider } from '@/contexts/DriverRealtimeContext';
import { DriverShellProvider } from '@/contexts/DriverShellContext';
import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { useAuthUid } from '@/hooks/useAuthUid';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { markDriverStackMounted } from '@/lib/driverStack';
import { useAuth } from '@/services/AuthContext';
import { logDriverLayoutState } from '@/utils/driverLifecycleLog';
import { useDriverMountLog } from '@/utils/driverMountLog';
import { usePathname, useSegments } from 'expo-router';
import React, { memo, useEffect, useMemo, useState } from 'react';

/**
 * Driver providers mount only when auth + role + uid are stable and role is driver.
 * Layout shell stays mounted; providers attach/detach without tearing down Expo route.
 */
function DriverStackGateInner() {
  const pathname = usePathname();
  const segments = useSegments();
  const segmentList = segments as string[];
  const uid = useAuthUid();
  const { authReady, roleResolved, loading } = useAuth();
  const { routingWorkspace } = useActiveWorkspace();
  const role = normalizeRoleForRouting(routingWorkspace);

  useDriverMountLog('DriverLayout', uid || null);

  const providerReadyNow = useMemo(
    () =>
      authReady &&
      roleResolved &&
      !loading &&
      Boolean(uid) &&
      role === 'driver',
    [authReady, roleResolved, loading, uid, role],
  );

  const [latchedUid, setLatchedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setLatchedUid(null);
      return;
    }
    // Latch once — never clear on transient routing/segment flaps.
    if (providerReadyNow) {
      setLatchedUid(uid);
    }
  }, [uid, providerReadyNow]);

  const providerActive = Boolean(uid) && latchedUid === uid;

  useEffect(() => {
    markDriverStackMounted();
  }, []);

  useEffect(() => {
    logDriverLayoutState({
      pathname,
      segments: segmentList,
      routeGroup: segmentList[0] ?? null,
      role,
      authReady,
      roleResolved,
      uid: uid || null,
      loading,
      providerReady: providerActive,
      reason: providerActive ? 'providers-active' : 'providers-waiting',
    });
  }, [
    pathname,
    segmentList,
    role,
    authReady,
    roleResolved,
    uid,
    loading,
    providerActive,
  ]);

  if (!providerActive) {
    return (
      <DriverFallbackScreen
        message={
          role !== 'driver'
            ? 'Driver workspace unavailable for this account.'
            : 'Preparing driver workspace…'
        }
      />
    );
  }

  return (
    <DriverRealtimeProvider uid={uid}>
      <DriverPresenceProvider uid={uid}>
        <DriverShellProvider>
          <RouteGroupMonitor />
          <DriverLiveSharingHost />
          <DriverTabsNavigator />
        </DriverShellProvider>
      </DriverPresenceProvider>
    </DriverRealtimeProvider>
  );
}

export const DriverStackGate = memo(DriverStackGateInner);
