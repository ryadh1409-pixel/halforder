import { useBootstrap } from '@/contexts/BootstrapContext';
import { useStableRouteContext } from '@/hooks/useStableRouteContext';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { canRunRouteGroupDiagnostics } from '@/lib/router/hydration';
import { snapshotRoleBoundary } from '@/lib/routing/roleBoundary';
import { useAuth } from '@/services/AuthContext';
import React, { useEffect, useRef } from 'react';

/**
 * Passive role/route-group observer — never navigates.
 * Cross-shell recovery is owned exclusively by {@link StartupRedirectOrchestrator}.
 */
export function RoleBoundaryGuard(): null {
  const { routerReady } = useBootstrap();
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();
  const lastLogKeyRef = useRef<string | null>(null);
  const stableRoute = useStableRouteContext({ redirectInFlight: false });

  const ready = authReady && roleResolved && !loading;
  const signedIn = isRegisteredAuthUser(user);
  const segmentList = stableRoute.stableSegments;
  const segmentKey = segmentList.join('/');

  useEffect(() => {
    if (!routerReady || !ready || !signedIn || !stableRoute.settled) {
      lastLogKeyRef.current = null;
      return;
    }

    if (
      !canRunRouteGroupDiagnostics({
        authReady,
        roleResolved,
        pathname: stableRoute.pathname,
        segments: segmentList,
      })
    ) {
      return;
    }

    const snapshot = snapshotRoleBoundary(firestoreUserRole, stableRoute.pathname, segmentList);
    if (!snapshot.violation) {
      lastLogKeyRef.current = null;
      return;
    }

    const logKey = JSON.stringify({
      role: snapshot.role,
      pathname: snapshot.pathname,
      actualGroup: snapshot.actualGroup,
      expectedGroup: snapshot.expectedGroup,
    });
    if (lastLogKeyRef.current === logKey) return;
    lastLogKeyRef.current = logKey;

    if (__DEV__) {
      console.warn('[RoleBoundaryGuard] persistent route group violation (observer only)', {
        ...snapshot,
        normalizedGroup: stableRoute.normalizedGroup,
      });
    }
  }, [
    authReady,
    firestoreUserRole,
    ready,
    roleResolved,
    routerReady,
    segmentKey,
    signedIn,
    stableRoute.normalizedGroup,
    stableRoute.pathname,
    stableRoute.settled,
  ]);

  return null;
}
