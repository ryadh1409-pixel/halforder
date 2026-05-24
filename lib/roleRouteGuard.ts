import { resetAuthSessionBootstrap } from '@/lib/authSessionBootstrap';
import { resetAuthRoleLogs } from '@/lib/authRole';
import { resetDriverStackLatch } from '@/lib/driverStack';
import { isInDriverGroup, isInHostGroup, isInUserGroup } from '@/lib/routeGroups';
import {
  clearStartupNavigationState,
  hasRoleShellLandingCompleted,
} from '@/lib/startup/state';
import type { UserRole } from '@/services/userService';
import { resetDevProviderMountCounts } from '@/utils/devBootstrapDiagnostics';
import { resetDriverListenerLogs } from '@/utils/driverListenerLog';
import { resetDriverMountLogs } from '@/utils/driverMountLog';
import { resetDriverLifecycleLogs, resetRedirectDecisionLogs } from '@/utils/driverLifecycleLog';
import { resetRouteDiagnostics } from '@/utils/routeDiagnostics';
import { resetRouteAssertionLogs } from '@/lib/routeAssertion';
import { resetRouteGroupCheckLogs } from '@/utils/routeGroupCheck';
import { resetStartupDiagnostics } from '@/utils/startupDiagnostics';

export {
  completedRedirects,
  completedRoleRedirects,
  hasRoleShellLandingCompleted,
  hasRedirectCompleted,
  markRedirectCompleted,
  markRoleShellLandingComplete,
} from '@/lib/startup/state';

const ROLE_SHELLS = new Set([
  '(tabs)',
  '(driver)',
  '(host)',
  '(auth)',
  '(customer)',
  '(restaurant)',
]);

/** Pure check — no side effects. */
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
  if (hasRoleShellLandingCompleted()) return false;
  if (isInsideRoleShell(segments, pathname)) return false;

  if (pathname !== '/' && pathname !== '/index') {
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
  return isInUserGroup(segments, pathname);
}

export function clearRoleRedirectGuards(): void {
  clearStartupNavigationState();
  resetDriverStackLatch();
  resetDriverMountLogs();
  resetDriverListenerLogs();
  resetAuthRoleLogs();
  resetAuthSessionBootstrap();
  resetRouteDiagnostics();
  resetRouteGroupCheckLogs();
  resetRouteAssertionLogs();
  resetStartupDiagnostics();
  resetDevProviderMountCounts();
  resetDriverLifecycleLogs();
  resetRedirectDecisionLogs();
}
