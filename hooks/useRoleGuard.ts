import { useAuth } from '@/services/AuthContext';
import type { UserRole } from '@/services/userService';

/** Tab / screen guards — keep arrays stable or pass a matching `allowedKey`. */
export const DRIVER_TAB_ROLES: readonly UserRole[] = ['driver', 'admin'];
export const HOST_TAB_ROLES: readonly UserRole[] = ['restaurant', 'host'];
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';

export type UseRoleGuardOptions = {
  /** Stable key for the effect dependency array, e.g. `['driver','admin'].slice().sort().join('|')` → `"admin|driver"` */
  allowedKey: string;
  allowedRoles: readonly UserRole[];
  fallbackHref: string;
  /** When true, signed-out users are sent to `loginHref` (default `/(auth)/login`). */
  redirectWhenLoggedOut?: boolean;
  loginHref?: string;
};

/**
 * Role gate without redirects during render. Redirects at most once per “wrong role” /
 * “logged out” episode to avoid navigation loops.
 */
export function useRoleGuard(opts: UseRoleGuardOptions) {
  const { user, loading, firestoreUserRole } = useAuth();

  const allowedRef = useRef<UserRole[]>([...opts.allowedRoles]);
  allowedRef.current = [...opts.allowedRoles];

  const wrongRoleRedirectedRef = useRef(false);
  const loginRedirectedRef = useRef(false);

  const effectiveRole = (firestoreUserRole ?? 'user') as UserRole;

  const authorized = useMemo(() => {
    if (!user || loading) return false;
    return allowedRef.current.includes(effectiveRole);
  }, [user, loading, effectiveRole]);

  useEffect(() => {
    if (__DEV__) {
      console.log('[useRoleGuard]', opts.allowedKey, 'loading=', loading, 'role=', firestoreUserRole);
    }
  }, [loading, firestoreUserRole, opts.allowedKey]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (!opts.redirectWhenLoggedOut) return;
      const dest = opts.loginHref ?? '/(auth)/login';
      if (loginRedirectedRef.current) return;
      loginRedirectedRef.current = true;
      router.replace(dest as never);
      return;
    }

    loginRedirectedRef.current = false;

    if (allowedRef.current.includes(effectiveRole)) {
      wrongRoleRedirectedRef.current = false;
      return;
    }

    if (wrongRoleRedirectedRef.current) return;
    wrongRoleRedirectedRef.current = true;
    router.replace(opts.fallbackHref as never);
  }, [
    loading,
    user,
    effectiveRole,
    opts.allowedKey,
    opts.fallbackHref,
    opts.loginHref,
    opts.redirectWhenLoggedOut,
  ]);

  return { authorized };
}
