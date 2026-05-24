/**
 * Pure startup redirect policy — no React, no side effects.
 */
import { getRouteForRole, normalizeRoleForRouting } from '@/lib/authRole';
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
} from '@/lib/routeGroups';
import { isRootEntryPathname } from '@/lib/router/hydration';
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
  hydrationTimedOut: boolean;
}): RedirectDecision {
  const { uid, role, pathname, segments, sessionAlreadyDone, hydrationTimedOut } = params;
  const normalized = normalizeRoleForRouting(role);
  const targetRoute = getRouteForRole(normalized);
  const sessionKey = roleLandingKey(uid, role);

  if (sessionAlreadyDone) {
    return { action: 'skip', reason: 'session-already-redirected' };
  }

  if (isDriverStackMounted() && isInDriverGroup(segments, pathname)) {
    return { action: 'complete', reason: 'driver-stack-latched', targetRoute };
  }

  if (isInsideCorrectRoleShell(normalized, segments, pathname)) {
    return { action: 'complete', reason: 'already-in-correct-role-group', targetRoute };
  }

  if (isWrongGroupForRole(normalized, segments, pathname)) {
    if (!hydrationTimedOut && isRootEntryPathname(pathname) && segments.length === 0) {
      return { action: 'skip', reason: 'wrong-group-waiting-route-context' };
    }
    return { action: 'redirect', reason: 'wrong-route-group-recovery', targetRoute };
  }

  if (isAlreadyOnRoleRoute(pathname, segments, normalized)) {
    return { action: 'complete', reason: 'already-on-role-route', targetRoute };
  }

  if (!isAtAppEntryPoint(pathname, segments) && !isRootEntryPathname(pathname)) {
    return { action: 'skip', reason: 'not-app-entry-point' };
  }

  /** Entry landing from `/` — segments may stay empty until replace runs. */
  if (isRootEntryPathname(pathname) || isAtAppEntryPoint(pathname, segments)) {
    return { action: 'redirect', reason: 'entry-landing-by-role', targetRoute };
  }

  return { action: 'skip', reason: 'no-policy-match' };
}

export function sessionKeyForRole(uid: string, role: UserRole): string {
  return roleLandingKey(uid, role);
}
