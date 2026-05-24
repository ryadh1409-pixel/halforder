import {
  getRouteGroup,
  getRouteGroupFromPathname,
  getRouteGroupFromSegments,
  isInDriverGroup,
  isInHostGroup,
  isInTabsGroup,
  isInUserGroup,
  type RouteGroup,
} from '@/lib/routing/routeConstants';
import { normalizeRoleForRouting, type RoutingRole } from '@/lib/routing/roleTypes';
import type { UserRole } from '@/services/userService';

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
      return pathname.startsWith('/admin') || segments[0] === 'admin' || pathname.includes('/admin');
    case 'user':
    default:
      return isInUserGroup(segments, pathname);
  }
}

export function isWrongGroupForRole(
  role: UserRole | null | undefined,
  segments: string[],
  pathname: string,
): boolean {
  const normalized = normalizeRoleForRouting(role);
  if (normalized === 'driver') {
    if (isInHostGroup(segments, pathname) && !isInDriverGroup(segments, pathname)) {
      return true;
    }
    return isInTabsGroup(segments, pathname) && !isInDriverGroup(segments, pathname);
  }
  if (normalized === 'user') {
    return isInDriverGroup(segments, pathname) && !isInTabsGroup(segments, pathname);
  }
  if (normalized === 'restaurant') {
    if (isInDriverGroup(segments, pathname) && !isInHostGroup(segments, pathname)) {
      return true;
    }
    return isInTabsGroup(segments, pathname) && !isInHostGroup(segments, pathname);
  }
  return false;
}

export function isRoleRouteGroupViolation(
  role: UserRole | null | undefined,
  pathname: string,
  segments: string[],
): boolean {
  if (!role) return false;
  const normalized = normalizeRoleForRouting(role);
  if (normalized === 'admin') {
    const group = getRouteGroup(segments, pathname);
    if (group === '(tabs)' && pathname.includes('/admin')) return false;
    if (group === 'other' && pathname.includes('admin')) return false;
    return isWrongGroupForRole(normalized, segments, pathname);
  }
  return isWrongGroupForRole(normalized, segments, pathname);
}

export function isRoleRouteGroupViolationFromPathname(
  role: UserRole | null | undefined,
  pathname: string,
): boolean {
  if (!role) return false;
  const pathnameGroup = getRouteGroupFromPathname(pathname);
  if (pathnameGroup === 'other') return false;
  return isRoleRouteGroupViolation(role, pathname, [pathnameGroup]);
}

export function isRoleRouteGroupViolationFromSegments(
  role: UserRole | null | undefined,
  segments: string[],
): boolean {
  if (!role) return false;
  const segmentsGroup = getRouteGroupFromSegments(segments);
  if (segmentsGroup === 'other') return false;
  return isRoleRouteGroupViolation(role, '/', [segmentsGroup]);
}

/**
 * Strict mismatch consensus: require both pathname and segments to indicate
 * a violation. Pathname is primary and must be non-`other`.
 */
export function hasPersistentRoleRouteGroupViolation(
  role: UserRole | null | undefined,
  pathname: string,
  segments: string[],
): boolean {
  return (
    isRoleRouteGroupViolationFromPathname(role, pathname) &&
    isRoleRouteGroupViolationFromSegments(role, segments)
  );
}

export type { RoutingRole };
