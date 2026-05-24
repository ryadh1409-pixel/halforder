import { assertRoleRouteGroup } from '@/lib/routeAssertion';
import type { UserRole } from '@/services/userService';

let lastLogKey = '';

export function resetRouteGroupCheckLogs(): void {
  lastLogKey = '';
}

/** @deprecated Prefer {@link assertRoleRouteGroup} — kept for call-site compatibility. */
export function logRouteGroupCheck(params: {
  pathname: string;
  segments: string[];
  role: UserRole | null | undefined;
  authReady?: boolean;
  roleResolved?: boolean;
  requireRedirectSettled?: boolean;
}): void {
  const key = JSON.stringify({
    pathname: params.pathname,
    segments: params.segments,
    role: params.role,
  });
  if (lastLogKey === key) return;
  lastLogKey = key;

  assertRoleRouteGroup({
    role: params.role,
    pathname: params.pathname,
    segments: params.segments,
    authReady: params.authReady ?? true,
    roleResolved: params.roleResolved ?? true,
    requireRedirectSettled: params.requireRedirectSettled,
  });
}
