import { normalizeRoleForRouting } from '@/lib/authRole';
import type { UserRole } from '@/services/userService';

export type RouteGroup = '(driver)' | '(tabs)' | '(host)' | '(auth)' | '(customer)' | '(restaurant)' | 'other';

/** True when Expo Router segments place the user inside the driver group. */
export function isInDriverGroup(segments: string[], pathname: string): boolean {
  if (segments[0] === '(driver)') return true;
  if (segments.includes('(driver)')) return true;
  if (pathname.includes('(driver)')) return true;
  /** Legacy `app/driver/*` URLs only — not `/driver-profile` (driver tab inside `(driver)`). */
  if (segments[0] === 'driver') return true;
  if (/^\/driver\//.test(pathname)) return true;
  return false;
}

/** True when Expo Router segments place the user inside the restaurant host group. */
export function isInHostGroup(segments: string[], pathname: string): boolean {
  if (segments[0] === '(host)') return true;
  if (segments.includes('(host)')) return true;
  if (pathname.includes('(host)')) return true;
  return false;
}

/** True when Expo Router segments place the user inside the customer tabs group. */
export function isInTabsGroup(segments: string[], pathname: string): boolean {
  if (segments[0] === '(tabs)') return true;
  if (segments.includes('(tabs)')) return true;
  if (pathname.includes('(tabs)')) return true;
  return false;
}

export function getRouteGroup(segments: string[], pathname: string): RouteGroup {
  const root = segments[0];
  if (root === '(driver)' || isInDriverGroup(segments, pathname)) return '(driver)';
  if (root === '(tabs)' || isInTabsGroup(segments, pathname)) return '(tabs)';
  if (root === '(host)' || pathname.includes('(host)')) return '(host)';
  if (root === '(auth)' || pathname.includes('(auth)')) return '(auth)';
  if (root === '(customer)' || pathname.includes('(customer)')) return '(customer)';
  if (root === '(restaurant)' || pathname.includes('(restaurant)')) return '(restaurant)';
  return 'other';
}

export function expectedGroupForRole(role: UserRole | null | undefined): RouteGroup {
  const normalized = normalizeRoleForRouting(role);
  switch (normalized) {
    case 'driver':
      return '(driver)';
    case 'restaurant':
      return '(host)';
    case 'admin':
      return 'other';
    case 'user':
    default:
      return '(tabs)';
  }
}

/** True when the user is inside the shell that matches their Firestore role. */
export function isInsideCorrectRoleShell(
  role: UserRole | null | undefined,
  segments: string[],
  pathname: string,
): boolean {
  const normalized = normalizeRoleForRouting(role);
  switch (normalized) {
    case 'driver':
      return isInDriverGroup(segments, pathname);
    case 'restaurant':
      return isInHostGroup(segments, pathname);
    case 'admin':
      return pathname.startsWith('/admin') || segments[0] === 'admin';
    case 'user':
    default:
      return isInTabsGroup(segments, pathname);
  }
}

/** Driver in tabs or customer in driver stack — accidental cross-group navigation. */
export function isWrongGroupForRole(
  role: UserRole | null | undefined,
  segments: string[],
  pathname: string,
): boolean {
  const normalized = normalizeRoleForRouting(role);
  if (normalized === 'driver') {
    return isInTabsGroup(segments, pathname) && !isInDriverGroup(segments, pathname);
  }
  if (normalized === 'user') {
    return isInDriverGroup(segments, pathname) && !isInTabsGroup(segments, pathname);
  }
  if (normalized === 'restaurant') {
    return isInTabsGroup(segments, pathname) && !isInHostGroup(segments, pathname);
  }
  return false;
}
