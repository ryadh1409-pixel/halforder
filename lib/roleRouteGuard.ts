import type { UserRole } from '@/services/userService';

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

/** True when navigation is already inside a role shell (driver, tabs, etc.). */
export function isInsideRoleShell(segments: string[], pathname: string): boolean {
  const root = segments[0];
  if (root && ROLE_SHELLS.has(root)) {
    markRoleShellLandingComplete();
    return true;
  }

  if (
    pathname.includes('(driver)') ||
    pathname.includes('(tabs)') ||
    pathname.includes('(host)') ||
    pathname.includes('(auth)') ||
    pathname.startsWith('/driver')
  ) {
    markRoleShellLandingComplete();
    return true;
  }

  return false;
}

/** True only at bare app entry — not when Expo reports `/` while a shell is active. */
export function isAtAppEntryPoint(pathname: string, segments: string[]): boolean {
  if (roleShellLandingComplete) return false;
  if (isInsideRoleShell(segments, pathname)) return false;

  if (pathname !== '/' && pathname !== '/index') {
    return false;
  }

  // Any segment means a stack/group is already mounted.
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
    return segments[0] === '(driver)' || pathname.includes('(driver)') || pathname.startsWith('/driver');
  }
  if (normalized === 'restaurant') {
    return segments[0] === '(host)' || pathname.includes('(host)');
  }
  if (normalized === 'admin') {
    return pathname.startsWith('/admin') || segments[0] === 'admin';
  }
  return segments[0] === '(tabs)' || pathname.includes('(tabs)');
}
