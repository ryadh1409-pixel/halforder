import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { normalizeRoleForRouting, type RoutingRole } from '@/lib/routing/roleTypes';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useMemo } from 'react';

export type CustomerTabsBlockReason =
  | 'ready'
  | 'auth-loading'
  | 'role-pending'
  | 'wrong-role-not-customer';

/**
 * Whether the `(tabs)` layout may mount its navigator.
 * Uses active workspace (not Firestore demotion) so drivers/restaurants can browse as customers.
 */
export function useCustomerTabsAccess() {
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();
  const { ready: workspaceReady, routingWorkspace } = useActiveWorkspace();

  return useMemo(() => {
    const signedIn = isRegisteredAuthUser(user);
    const authSettled = authReady && !loading;
    const customerWorkspace =
      workspaceReady &&
      (routingWorkspace === 'user' || firestoreUserRole === 'admin');
    const role: RoutingRole =
      firestoreUserRole === 'admin'
        ? 'admin'
        : normalizeRoleForRouting(routingWorkspace);

    let blockReason: CustomerTabsBlockReason = 'ready';
    if (!authSettled) {
      blockReason = 'auth-loading';
    } else if (signedIn && (!roleResolved || !workspaceReady)) {
      blockReason = 'role-pending';
    } else if (signedIn && !customerWorkspace) {
      blockReason = 'wrong-role-not-customer';
    }

    const canMountTabs =
      blockReason === 'ready' &&
      authSettled &&
      (!signedIn ||
        (roleResolved && workspaceReady && signedIn && customerWorkspace));

    return {
      canMountTabs,
      blockReason,
      customerWorkspace,
      authSettled,
      roleResolved,
      signedIn,
      role,
      firestoreRole: firestoreUserRole,
    };
  }, [
    authReady,
    firestoreUserRole,
    loading,
    roleResolved,
    routingWorkspace,
    user,
    workspaceReady,
  ]);
}
