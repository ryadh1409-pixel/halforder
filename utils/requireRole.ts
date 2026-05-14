import { useAuth } from '../services/AuthContext';
import { type UserRole } from '../services/userService';
import { useMemo } from 'react';

export function useRequireRole(allowedRoles: UserRole[]) {
  const { user, role, loading } = useAuth();

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
