import { RouteGroupMonitor } from '@/components/RouteGroupMonitor';
import { DriverFallbackScreen } from '@/components/driver/DriverFallbackScreen';
import DriverTabsNavigator from '@/components/driver/DriverTabsNavigator';
import { DriverPresenceProvider } from '@/contexts/DriverPresenceContext';
import { DriverRealtimeProvider } from '@/contexts/DriverRealtimeContext';
import { DriverShellProvider } from '@/contexts/DriverShellContext';
import { useAuthUid } from '@/hooks/useAuthUid';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { markDriverStackMounted } from '@/lib/driverStack';
import { isInDriverGroup } from '@/lib/driverRouteUtils';
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
  const { authReady, roleResolved, loading, firestoreUserRole } = useAuth();
  const role = normalizeRoleForRouting(firestoreUserRole);

  useDriverMountLog('DriverLayout', uid || null);

  const inDriverGroup = isInDriverGroup(segmentList, pathname);

  const providerReadyNow = useMemo(
    () =>
      authReady &&
      roleResolved &&
      !loading &&
      Boolean(uid) &&
      role === 'driver' &&
      inDriverGroup,
    [authReady, roleResolved, loading, uid, role, inDriverGroup],
  );

  const [providersLatched, setProvidersLatched] = useState(false);

  useEffect(() => {
    if (!inDriverGroup || !uid) {
      setProvidersLatched(false);
      return;
    }
    if (providerReadyNow) {
      setProvidersLatched(true);
    }
  }, [inDriverGroup, providerReadyNow, uid]);

  const providerActive = providersLatched && inDriverGroup;

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
          <DriverTabsNavigator />
        </DriverShellProvider>
      </DriverPresenceProvider>
    </DriverRealtimeProvider>
  );
}

export const DriverStackGate = memo(DriverStackGateInner);
