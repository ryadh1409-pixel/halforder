import { normalizeRoleForRouting } from '@/lib/authRole';
import { canRunRouteGroupDiagnostics } from '@/lib/router/hydration';
import {
  expectedGroupForRole,
  getRouteGroup,
  isInDriverGroup,
  isInHostGroup,
  isInTabsGroup,
} from '@/lib/routeGroups';
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
  const actualGroup = getRouteGroup(segmentList, params.pathname);
  const expectedGroup = expectedGroupForRole(params.role);

  const mismatchKey = JSON.stringify({
    role: normalized,
    pathname: params.pathname,
    segments: segmentList,
    actualGroup,
    expectedGroup,
  });
  if (lastMismatchKey === mismatchKey) return;

  let mismatch: string | null = null;

  if (normalized === 'driver' && isInTabsGroup(segmentList, params.pathname)) {
    mismatch = 'driver role entered (tabs) group';
  } else if (normalized === 'user' && isInDriverGroup(segmentList, params.pathname)) {
    mismatch = 'user role entered (driver) group';
  } else if (normalized === 'restaurant' && isInDriverGroup(segmentList, params.pathname)) {
    mismatch = 'restaurant role entered (driver) group';
  } else if (
    normalized === 'restaurant' &&
    isInTabsGroup(segmentList, params.pathname) &&
    !isInHostGroup(segmentList, params.pathname)
  ) {
    mismatch = 'restaurant role entered (tabs) group';
  } else if (normalized === 'driver' && isInHostGroup(segmentList, params.pathname)) {
    mismatch = 'driver role entered (host) group';
  } else if (
    normalized === 'user' &&
    isInHostGroup(segmentList, params.pathname) &&
    !isInTabsGroup(segmentList, params.pathname)
  ) {
    mismatch = 'user role entered (host) group';
  }

  if (!mismatch) return;

  lastMismatchKey = mismatchKey;
  console.warn(`[ROUTE GROUP CHECK] ${mismatch}`, {
    pathname: params.pathname,
    segments: segmentList,
    expectedGroup,
    actualGroup,
    role: normalized,
  });
}
