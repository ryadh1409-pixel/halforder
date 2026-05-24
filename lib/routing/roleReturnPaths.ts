import { normalizeReturnPathAfterTerms } from '@/constants/termsAcceptance';
import { isInTabsGroup, type RouteGroup } from '@/lib/routing/routeConstants';
import {
  expectedGroupForRole,
  isInsideCorrectRoleShell,
  isRoleRouteGroupViolation,
} from '@/lib/routing/routeMaps';
import { isCustomerTabsRole, normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { roleDefaultPath, roleRouteResolver } from '@/lib/routing/routePaths';
import type { UserRole } from '@/services/userService';

export function expectedRouteGroupForRole(role: UserRole | null | undefined): RouteGroup {
  return expectedGroupForRole(role);
}

export function isRoleAllowedInRouteGroup(
  role: UserRole | null | undefined,
  group: RouteGroup,
): boolean {
  const normalized = normalizeRoleForRouting(role);
  switch (group) {
    case '(driver)':
      return normalized === 'driver';
    case '(host)':
      return normalized === 'restaurant';
    case '(tabs)':
      return normalized === 'user' || normalized === 'admin';
    case '(auth)':
      return true;
    case '(customer)':
      return normalized === 'user';
    default:
      return normalized === 'admin';
  }
}

export function isInsideRoleHomeShell(
  role: UserRole | null | undefined,
  pathname: string,
  segments: string[],
): boolean {
  return isInsideCorrectRoleShell(role, segments, pathname);
}

export { isRoleRouteGroupViolation } from '@/lib/routing/routeMaps';

export function resolveReturnPathForRole(
  role: UserRole | null | undefined,
  raw?: string,
): string {
  const home = roleDefaultPath(role);
  const path = normalizeReturnPathAfterTerms(raw);
  if (!raw?.trim()) {
    return typeof home === 'string' ? home : roleRouteResolver(role);
  }

  const pseudoSegments = path
    .split('/')
    .filter(Boolean)
    .map((part) => (part.startsWith('(') ? part : part));

  if (isRoleRouteGroupViolation(role, path, pseudoSegments)) {
    return typeof home === 'string' ? home : roleRouteResolver(role);
  }

  return path;
}

export function roleTermsReturnPath(role: UserRole | null | undefined): string {
  return resolveReturnPathForRole(role);
}

export { isCustomerTabsRole } from '@/lib/routing/roleTypes';

export function isTabsPathForWrongRole(
  role: UserRole | null | undefined,
  pathname: string,
  segments: string[],
): boolean {
  return isInTabsGroup(segments, pathname) && !isCustomerTabsRole(role);
}
