import {
  expectedGroupForRole,
  getRouteGroup,
  isInDriverGroup,
  isInHostGroup,
  isInTabsGroup,
} from '@/lib/routeGroups';
import { normalizeRoleForRouting } from '@/lib/authRole';
import type { UserRole } from '@/services/userService';

let lastLogKey = '';

export function resetRouteGroupCheckLogs(): void {
  lastLogKey = '';
}

export function logRouteGroupCheck(params: {
  pathname: string;
  segments: string[];
  role: UserRole | null | undefined;
}): void {
  if (!__DEV__) return;

  const actualGroup = getRouteGroup(params.segments, params.pathname);
  const expectedGroup = expectedGroupForRole(params.role);
  const key = JSON.stringify({
    pathname: params.pathname,
    segments: params.segments,
    role: params.role,
    actualGroup,
    expectedGroup,
  });
  if (lastLogKey === key) return;
  lastLogKey = key;

  console.log('[ROUTE GROUP CHECK]', {
    pathname: params.pathname,
    segments: params.segments,
    expectedGroup,
    actualGroup,
    role: params.role,
  });

  const normalized = normalizeRoleForRouting(params.role);
  if (normalized === 'driver' && isInTabsGroup(params.segments, params.pathname)) {
    console.warn('[ROUTE GROUP CHECK] driver role entered (tabs) group', {
      pathname: params.pathname,
      segments: params.segments,
    });
  }
  if (normalized === 'user' && isInDriverGroup(params.segments, params.pathname)) {
    console.warn('[ROUTE GROUP CHECK] user role entered (driver) group', {
      pathname: params.pathname,
      segments: params.segments,
    });
  }
  if (normalized === 'restaurant' && isInDriverGroup(params.segments, params.pathname)) {
    console.warn('[ROUTE GROUP CHECK] restaurant role entered (driver) group', {
      pathname: params.pathname,
      segments: params.segments,
      expectedGroup,
      actualGroup,
    });
  }
  if (normalized === 'driver' && isInHostGroup(params.segments, params.pathname)) {
    console.warn('[ROUTE GROUP CHECK] driver role entered (host) group', {
      pathname: params.pathname,
      segments: params.segments,
      expectedGroup,
      actualGroup,
    });
  }
}
