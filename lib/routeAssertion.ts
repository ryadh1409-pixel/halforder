import { canRunRouteGroupDiagnostics } from '@/lib/router/hydration';
import {
  getRouteGroup,
  getRouteGroupFromPathname,
} from '@/lib/routing/routeConstants';
import { hasPersistentRoleRouteGroupViolation } from '@/lib/routing/routeMaps';
import { expectedRouteGroupForRole } from '@/lib/routing/roleReturnPaths';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import type { UserRole } from '@/services/userService';

let lastMismatchKey = '';

export function resetRouteAssertionLogs(): void {
  lastMismatchKey = '';
}

export type AssertRoleRouteGroupParams = {
  role: UserRole | null | undefined;
  pathname: string;
  segments: string[];
  authReady: boolean;
  roleResolved: boolean;
  requireRedirectSettled?: boolean;
};

/**
 * Dev-only warnings for real cross-shell mismatches.
 * Skips transient index bootstrap (`/`, segments []).
 */
export function assertRoleRouteGroup(params: AssertRoleRouteGroupParams): void {
  if (!__DEV__) return;

  const segmentList = params.segments;
  if (
    !canRunRouteGroupDiagnostics({
      authReady: params.authReady,
      roleResolved: params.roleResolved,
      pathname: params.pathname,
      segments: segmentList,
    })
  ) {
    return;
  }

  const normalized = normalizeRoleForRouting(params.role);
  const actualGroup =
    getRouteGroupFromPathname(params.pathname) !== 'other'
      ? getRouteGroupFromPathname(params.pathname)
      : getRouteGroup(segmentList, params.pathname);
  const expectedGroup = expectedRouteGroupForRole(params.role);

  if (!hasPersistentRoleRouteGroupViolation(params.role, params.pathname, segmentList)) {
    return;
  }

  const mismatchKey = JSON.stringify({
    role: normalized,
    pathname: params.pathname,
    segments: segmentList,
    actualGroup,
    expectedGroup,
  });
  if (lastMismatchKey === mismatchKey) return;

  const mismatch = `${normalized} role entered ${actualGroup} group (expected ${expectedGroup})`;

  lastMismatchKey = mismatchKey;
  console.warn(`[ROUTE GROUP CHECK] ${mismatch}`, {
    pathname: params.pathname,
    segments: segmentList,
    expectedGroup,
    actualGroup,
    role: normalized,
  });
}
