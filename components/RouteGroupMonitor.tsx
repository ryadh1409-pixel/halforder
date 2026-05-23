import { normalizeRoleForRouting } from '@/lib/authRole';
import { useAuth } from '@/services/AuthContext';
import { logRouteGroupCheck } from '@/utils/routeGroupCheck';
import { usePathname, useSegments } from 'expo-router';
import React, { useEffect } from 'react';

/** Dev diagnostics: warn when role and Expo route group diverge. */
export function RouteGroupMonitor() {
  const pathname = usePathname();
  const segments = useSegments();
  const { authReady, roleResolved, firestoreUserRole } = useAuth();
  const role = normalizeRoleForRouting(firestoreUserRole);

  useEffect(() => {
    if (!authReady || !roleResolved) return;
    logRouteGroupCheck({
      pathname,
      segments: segments as string[],
      role,
    });
  }, [authReady, pathname, role, roleResolved, segments]);

  return null;
}
