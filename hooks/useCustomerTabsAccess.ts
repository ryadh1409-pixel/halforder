import { isCustomerTabsRole, normalizeRoleForRouting } from '@/lib/routing/roleTypes';
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
 * False while role is unknown — prevents restaurant/driver tab tree flash.
 */
export function useCustomerTabsAccess() {
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();

  return useMemo(() => {
    const signedIn = isRegisteredAuthUser(user);
    const role = normalizeRoleForRouting(firestoreUserRole);
    const authSettled = authReady && !loading;
    const customerWorkspace = isCustomerTabsRole(firestoreUserRole);

    let blockReason: CustomerTabsBlockReason = 'ready';
    if (!authSettled) {
      blockReason = 'auth-loading';
    } else if (signedIn && !roleResolved) {
      blockReason = 'role-pending';
    } else if (signedIn && !customerWorkspace) {
      blockReason = 'wrong-role-not-customer';
    }

    const canMountTabs =
      blockReason === 'ready' &&
      authSettled &&
      (!signedIn || (roleResolved && signedIn && customerWorkspace));

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
  }, [authReady, firestoreUserRole, loading, roleResolved, user]);
}
