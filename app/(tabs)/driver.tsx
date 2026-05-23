import { DRIVER_TAB_ROLES } from '@/services/roles';
import { useAuth } from '@/services/AuthContext';
import type { UserRole } from '@/services/userService';
import { isInDriverGroup } from '@/lib/driverRouteUtils';
import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { logRedirectDecision } from '@/utils/driverLifecycleLog';
import { logRouteRedirect } from '@/utils/routeDiagnostics';
import { usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

const DRIVER_STACK_HREF = DRIVER_ROUTES.hub;

/**
 * Main-tabs driver entry: one-time redirect into canonical `/(driver)` stack.
 */
export default function DriverTabScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const hasRedirectedRef = useRef(false);
  const { user, loading, firestoreUserRole, authReady, roleResolved } = useAuth();
  const effectiveRole = (firestoreUserRole ?? 'user') as UserRole;
  const authorized = useMemo(
    () =>
      !loading &&
      authReady &&
      roleResolved &&
      Boolean(user) &&
      DRIVER_TAB_ROLES.includes(effectiveRole),
    [user, loading, authReady, roleResolved, effectiveRole],
  );

  useEffect(() => {
    if (!authorized || hasRedirectedRef.current) return;

    if (isInDriverGroup(segments as string[], pathname)) {
      hasRedirectedRef.current = true;
      logRedirectDecision({
        guard: 'DriverTabScreen',
        action: 'skip',
        from: pathname,
        to: DRIVER_STACK_HREF,
        reason: 'already-in-driver-group',
        role: effectiveRole,
        segments: segments as string[],
      });
      return;
    }

    hasRedirectedRef.current = true;
    logRedirectDecision({
      guard: 'DriverTabScreen',
      action: 'redirect',
      from: pathname,
      to: DRIVER_STACK_HREF,
      reason: 'tabs-driver-entry',
      role: effectiveRole,
      segments: segments as string[],
    });
    logRouteRedirect('/(tabs)/driver', DRIVER_STACK_HREF);
    router.replace(DRIVER_STACK_HREF);
  }, [authorized, effectiveRole, pathname, router, segments]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
