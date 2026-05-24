import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useMemo } from 'react';

/** Whether `(driver)` layout may mount — driver role only. */
export function useDriverShellAccess() {
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();

  return useMemo(() => {
    const signedIn = isRegisteredAuthUser(user);
    const role = normalizeRoleForRouting(firestoreUserRole);
    const authSettled = authReady && !loading;

    const canMountDriver =
      authSettled && roleResolved && signedIn && role === 'driver';

    return {
      canMountDriver,
      authSettled,
      roleResolved,
      signedIn,
      role,
    };
  }, [authReady, firestoreUserRole, loading, roleResolved, user]);
}
