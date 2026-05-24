import { isCustomerTabsRole, normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useMemo } from 'react';

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

    const canMountTabs =
      authSettled &&
      (!signedIn || (roleResolved && signedIn && isCustomerTabsRole(firestoreUserRole)));

    return {
      canMountTabs,
      authSettled,
      roleResolved,
      signedIn,
      role,
    };
  }, [authReady, firestoreUserRole, loading, roleResolved, user]);
}
