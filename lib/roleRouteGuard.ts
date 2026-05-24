import { resetAuthSessionBootstrap } from '@/lib/authSessionBootstrap';
import { resetAuthRoleLogs } from '@/lib/authRole';
import { resetDriverStackLatch } from '@/lib/driverStack';
import { isInDriverGroup, isInHostGroup, isInTabsGroup } from '@/lib/routeGroups';
import type { UserRole } from '@/services/userService';
import { resetDevProviderMountCounts } from '@/utils/devBootstrapDiagnostics';
import { resetDriverListenerLogs } from '@/utils/driverListenerLog';
import { resetDriverMountLogs } from '@/utils/driverMountLog';
import { resetDriverLifecycleLogs, resetRedirectDecisionLogs } from '@/utils/driverLifecycleLog';
import { resetRouteDiagnostics } from '@/utils/routeDiagnostics';
import { resetRouteGroupCheckLogs } from '@/utils/routeGroupCheck';

const ROLE_SHELLS = new Set([
  '(tabs)',
  '(driver)',
  '(host)',
  '(auth)',
  '(customer)',
  '(restaurant)',
]);

/** Set after first successful landing into any role shell — never re-run entry redirect. */
let roleShellLandingComplete = false;

export function markRoleShellLandingComplete(): void {
  roleShellLandingComplete = true;
}

export function hasRoleShellLandingCompleted(): boolean {
  return roleShellLandingComplete;
}

export function resetRoleShellLanding(): void {
  roleShellLandingComplete = false;
}

/** Completed `router.replace` targets — never redirect to the same route twice. */
export const completedRedirects = new Set<string>();

/** Completed role landing per uid+role — one redirect per role per session. */
export const completedRoleRedirects = new Set<string>();

export function clearRoleRedirectGuards(): void {
  completedRedirects.clear();
  completedRoleRedirects.clear();
  resetRoleShellLanding();
  resetDriverStackLatch();
  resetDriverMountLogs();
  resetDriverListenerLogs();
  resetAuthRoleLogs();
  resetAuthSessionBootstrap();
  resetRouteDiagnostics();
  resetRouteGroupCheckLogs();
  resetDevProviderMountCounts();
  resetDriverLifecycleLogs();
  resetRedirectDecisionLogs();
}

export function markRedirectCompleted(targetRoute: string, sessionKey?: string): void {
  completedRedirects.add(targetRoute);
  if (sessionKey) {
    completedRoleRedirects.add(sessionKey);
  }
  markRoleShellLandingComplete();
}

export function hasRedirectCompleted(targetRoute: string): boolean {
  return completedRedirects.has(targetRoute);
}

/** Pure check — no side effects (call markRoleShellLandingComplete at redirect sites). */
export function isInsideRoleShell(segments: string[], pathname: string): boolean {
  const root = segments[0];
  if (root && ROLE_SHELLS.has(root)) {
    return true;
  }

  return (
    pathname.includes('(driver)') ||
    pathname.includes('(tabs)') ||
    pathname.includes('(host)') ||
    pathname.includes('(auth)') ||
    /^\/driver\//.test(pathname)
  );
}

/** True only at bare app entry — not when Expo reports `/` while a shell is active. */
export function isAtAppEntryPoint(pathname: string, segments: string[]): boolean {
  if (roleShellLandingComplete) return false;
  if (isInsideRoleShell(segments, pathname)) return false;

  if (pathname !== '/' && pathname !== '/index') {
    return false;
  }

  if (segments.length > 0) {
    return false;
  }

  return true;
}

export function roleLandingKey(uid: string, role: UserRole): string {
  return `${uid}:${role}`;
}

export function isAlreadyOnRoleRoute(pathname: string, segments: string[], role: UserRole): boolean {
  const normalized = role === 'customer' ? 'user' : role === 'host' ? 'restaurant' : role;
  if (normalized === 'driver') {
    return isInDriverGroup(segments, pathname);
  }
  if (normalized === 'restaurant') {
    return isInHostGroup(segments, pathname);
  }
  if (normalized === 'admin') {
    return pathname.startsWith('/admin') || segments[0] === 'admin';
  }
  return isInTabsGroup(segments, pathname);
}
