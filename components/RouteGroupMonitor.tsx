import { assertRoleRouteGroup } from '@/lib/routeAssertion';
import { canRunRouteGroupDiagnostics } from '@/lib/router/hydration';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { useBootstrap } from '@/contexts/BootstrapContext';
import { useStableRouteContext } from '@/hooks/useStableRouteContext';
import { useAuth } from '@/services/AuthContext';
import React, { useEffect } from 'react';

/** Dev diagnostics: warn when role and Expo route group diverge (post-bootstrap only). */
export function RouteGroupMonitor() {
  const { authReady, roleResolved, firestoreUserRole } = useAuth();
  const { routerReady, interactive } = useBootstrap();
  const stableRoute = useStableRouteContext({ redirectInFlight: false });
  const role = normalizeRoleForRouting(firestoreUserRole);
  const segmentList = stableRoute.stableSegments;

  useEffect(() => {
    if (!interactive || !routerReady || !stableRoute.settled) return;

    const ctx = {
      authReady,
      roleResolved,
      pathname: stableRoute.pathname,
      segments: segmentList,
    };

    if (!canRunRouteGroupDiagnostics(ctx)) return;

    assertRoleRouteGroup({
      role,
      pathname: stableRoute.pathname,
      segments: segmentList,
      authReady,
      roleResolved,
    });
  }, [
    authReady,
    interactive,
    role,
    roleResolved,
    routerReady,
    segmentList,
    stableRoute.pathname,
    stableRoute.settled,
  ]);

  return null;
}
