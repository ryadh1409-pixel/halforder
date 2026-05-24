import { assertRoleRouteGroup } from '@/lib/routeAssertion';
import { canRunRouteGroupDiagnostics } from '@/lib/router/hydration';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { useBootstrap } from '@/contexts/BootstrapContext';
import { useAuth } from '@/services/AuthContext';
import { usePathname, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';

/** Dev diagnostics: warn when role and Expo route group diverge (post-bootstrap only). */
export function RouteGroupMonitor() {
  const pathname = usePathname();
  const segments = useSegments();
  const { authReady, roleResolved, firestoreUserRole } = useAuth();
  const { routerReady, interactive } = useBootstrap();
  const role = normalizeRoleForRouting(firestoreUserRole);
  const segmentList = segments as string[];
  const ranRef = useRef(false);

  useEffect(() => {
    if (!interactive || !routerReady) return;

    const ctx = {
      authReady,
      roleResolved,
      pathname,
      segments: segmentList,
    };

    if (!canRunRouteGroupDiagnostics(ctx)) return;

    assertRoleRouteGroup({
      role,
      pathname,
      segments: segmentList,
      authReady,
      roleResolved,
    });
    ranRef.current = true;
  }, [authReady, interactive, pathname, role, roleResolved, routerReady, segmentList]);

  return null;
}
