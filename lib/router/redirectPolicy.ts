/**
 * Pure startup redirect policy — no React, no side effects.
 */
import { isDriverStackMounted } from '@/lib/driverStack';
import { isInDriverGroup } from '@/lib/driverRouteUtils';
import {
  isAlreadyOnRoleRoute,
  isAtAppEntryPoint,
  roleLandingKey,
} from '@/lib/roleRouteGuard';
import {
  isInsideCorrectRoleShell,
  isWrongGroupForRole,
} from '@/lib/routing/routeMaps';
import { roleDefaultPath } from '@/lib/routing/routePaths';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isRootEntryPathname, isRouterReadyForRecovery } from '@/lib/router/hydration';
import type { UserRole } from '@/services/userService';

export type RedirectDecision =
  | { action: 'skip'; reason: string }
  | { action: 'complete'; reason: string; targetRoute: string }
  | { action: 'redirect'; reason: string; targetRoute: string };

export function evaluateRoleRedirect(params: {
  uid: string;
  role: UserRole;
  pathname: string;
  segments: string[];
  sessionAlreadyDone: boolean;
}): RedirectDecision {
  const { uid, role, pathname, segments, sessionAlreadyDone } = params;
  const normalized = normalizeRoleForRouting(role);
  const targetRoute = roleDefaultPath(normalized) as string;

  if (isWrongGroupForRole(normalized, segments, pathname)) {
    if (!isRouterReadyForRecovery(pathname, segments)) {
      return { action: 'skip', reason: 'wrong-group-waiting-route-context' };
    }
    return { action: 'redirect', reason: 'wrong-route-group-recovery', targetRoute };
  }

  if (sessionAlreadyDone) {
    return { action: 'skip', reason: 'session-already-redirected' };
  }

  if (isDriverStackMounted() && isInDriverGroup(segments, pathname)) {
    return { action: 'complete', reason: 'driver-stack-latched', targetRoute };
  }

  if (isInsideCorrectRoleShell(normalized, segments, pathname)) {
    return { action: 'complete', reason: 'already-in-correct-role-group', targetRoute };
  }

  if (isAlreadyOnRoleRoute(pathname, segments, normalized)) {
    return { action: 'complete', reason: 'already-on-role-route', targetRoute };
  }

  if (!isAtAppEntryPoint(pathname, segments) && !isRootEntryPathname(pathname)) {
    return { action: 'skip', reason: 'not-app-entry-point' };
  }

  if (isRootEntryPathname(pathname) || isAtAppEntryPoint(pathname, segments)) {
    return { action: 'redirect', reason: 'entry-landing-by-role', targetRoute };
  }

  return { action: 'skip', reason: 'no-policy-match' };
}

export function sessionKeyForRole(uid: string, role: UserRole): string {
  return roleLandingKey(uid, role);
}
