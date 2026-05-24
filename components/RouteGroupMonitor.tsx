import { assertRoleRouteGroup } from '@/lib/routeAssertion';
import { canRunRouteGroupDiagnostics } from '@/lib/router/hydration';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { useAuth } from '@/services/AuthContext';
import { logRouterReady } from '@/utils/startupDiagnostics';
import { usePathname, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';

/** Dev diagnostics: warn when role and Expo route group diverge (post-bootstrap only). */
export function RouteGroupMonitor() {
  const pathname = usePathname();
  const segments = useSegments();
  const { authReady, roleResolved, firestoreUserRole } = useAuth();
  const role = normalizeRoleForRouting(firestoreUserRole);
  const segmentList = segments as string[];
  const settledLoggedRef = useRef(false);

  useEffect(() => {
    const ctx = {
      authReady,
      roleResolved,
      pathname,
      segments: segmentList,
    };

    if (!canRunRouteGroupDiagnostics(ctx)) return;

    if (!settledLoggedRef.current) {
      settledLoggedRef.current = true;
      logRouterReady({ pathname, segments: segmentList, role });
    }

    assertRoleRouteGroup({
      role,
      pathname,
      segments: segmentList,
      authReady,
      roleResolved,
    });
  }, [authReady, pathname, role, roleResolved, segmentList]);

  return null;
}
