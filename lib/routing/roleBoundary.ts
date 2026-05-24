/**
 * Pure role/route-group boundary snapshot — no React, no auth, no navigation.
 */
import { getRouteGroup, type RouteGroup } from '@/lib/routing/routeConstants';
import {
  expectedGroupForRole,
  hasPersistentRoleRouteGroupViolation,
} from '@/lib/routing/routeMaps';
import { normalizeRoleForRouting, type RoutingRole } from '@/lib/routing/roleTypes';
import type { UserRole } from '@/services/userService';

export type RoleBoundarySnapshot = {
  violation: boolean;
  role: RoutingRole;
  actualGroup: RouteGroup;
  expectedGroup: RouteGroup;
  pathname: string;
  segments: string[];
};

export function snapshotRoleBoundary(
  role: UserRole | null | undefined,
  pathname: string,
  segments: string[],
): RoleBoundarySnapshot {
  const normalized = normalizeRoleForRouting(role);
  return {
    violation: Boolean(role) && hasPersistentRoleRouteGroupViolation(role, pathname, segments),
    role: normalized,
    actualGroup: getRouteGroup(segments, pathname),
    expectedGroup: expectedGroupForRole(role),
    pathname,
    segments,
  };
}
