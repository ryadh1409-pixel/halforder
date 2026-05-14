import { useAuth } from '@/services/AuthContext';
import type { UserRole } from '@/services/userService';
import { useMemo, useRef } from 'react';

export { DRIVER_TAB_ROLES, HOST_TAB_ROLES } from '@/services/roles';

export type UseRoleGuardOptions = {
  /** Stable key for memoization / logging, e.g. `"admin|driver"`. */
  allowedKey: string;
  allowedRoles: readonly UserRole[];
  /** Kept for API compatibility; unused (role `router.replace` lives in `app/_layout.tsx`). */
  fallbackHref: string;
  redirectWhenLoggedOut?: boolean;
  loginHref?: string;
};

/**
 * Optional role gate helper (no navigation). Prefer inlining `useAuth` + role arrays in screens;
 * root `/` role redirects are only in `app/_layout.tsx` (`RoleRouteGuard`).
 */
export function useRoleGuard(opts: UseRoleGuardOptions) {
  const { user, loading, firestoreUserRole } = useAuth();

  const allowedRef = useRef<UserRole[]>([...opts.allowedRoles]);
  allowedRef.current = [...opts.allowedRoles];

  const effectiveRole = (firestoreUserRole ?? 'user') as UserRole;

  const authorized = useMemo(() => {
    if (!user || loading) return false;
    return allowedRef.current.includes(effectiveRole);
  }, [user, loading, effectiveRole]);

  return { authorized };
}
