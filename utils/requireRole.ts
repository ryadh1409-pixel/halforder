import { goHome } from '../lib/navigation';
import { useAuth } from '../services/AuthContext';
import { type UserRole } from '../services/userService';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';

export function useRequireRole(allowedRoles: UserRole[]) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const allowedRef = useRef(allowedRoles);
  allowedRef.current = allowedRoles;
  /** Avoid repeated `goHome()` when `user` identity changes but role gate is unchanged. */
  const wrongRoleNavigatedRef = useRef(false);

  /** Stable for deps — inline `['admin']` from callers is a new array every render. */
  const allowedRolesKey = [...allowedRoles].sort().join('|');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      wrongRoleNavigatedRef.current = false;
      router.replace('/(auth)/login');
      return;
    }
    if (!role) return;
    if (!allowedRef.current.includes(role)) {
      if (wrongRoleNavigatedRef.current) return;
      wrongRoleNavigatedRef.current = true;
      goHome();
      return;
    }
    wrongRoleNavigatedRef.current = false;
  }, [allowedRolesKey, loading, role, router, user]);

  const authorized = !!user && !!role && allowedRoles.includes(role);

  return useMemo(
    () => ({
      loading,
      authorized,
      stale: false,
      error: null as string | null,
    }),
    [loading, authorized],
  );
}

export const requireRole = useRequireRole;
