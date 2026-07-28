import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '../services/AuthContext';
import { type UserRole } from '../services/userService';
import { useMemo } from 'react';

function isRoleAllowed(allowedRoles: UserRole[], role: UserRole | null | undefined): boolean {
  if (!role) return false;
  const normalized = normalizeRoleForRouting(role);
  return allowedRoles.some((allowed) => {
    if (allowed === role) return true;
    return normalizeRoleForRouting(allowed) === normalized;
  });
}

export function useRequireRole(allowedRoles: UserRole[]) {
  const { user, role, loading, roleResolved } = useAuth();
  const { ready: workspaceReady, routingWorkspace } = useActiveWorkspace();

  const rolePending =
    isRegisteredAuthUser(user) && (!roleResolved || !workspaceReady);
  const gateLoading = loading || rolePending;
  /** Prefer active workspace for shell gates — never demotes Firestore roles. */
  const effectiveRole: UserRole | null | undefined =
    role === 'admin' ? 'admin' : workspaceReady ? routingWorkspace : role;
  const authorized = !!user && isRoleAllowed(allowedRoles, effectiveRole);

  return useMemo(
    () => ({
      loading: gateLoading,
      authorized,
      stale: false,
      error: null as string | null,
    }),
    [gateLoading, authorized],
  );
}

export const requireRole = useRequireRole;
