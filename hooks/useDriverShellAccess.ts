import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useMemo } from 'react';

export type DriverShellBlockReason =
  | 'ready'
  | 'auth-loading'
  | 'role-pending'
  | 'not-signed-in'
  | 'wrong-role-not-driver';

/** Whether `(driver)` layout may mount — driver role only. */
export function useDriverShellAccess() {
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();

  return useMemo(() => {
    const signedIn = isRegisteredAuthUser(user);
    const role = normalizeRoleForRouting(firestoreUserRole);
    const authSettled = authReady && !loading;

    let blockReason: DriverShellBlockReason = 'ready';
    if (!authSettled) {
      blockReason = 'auth-loading';
    } else if (!roleResolved) {
      blockReason = 'role-pending';
    } else if (!signedIn) {
      blockReason = 'not-signed-in';
    } else if (firestoreUserRole !== 'driver' || role !== 'driver') {
      blockReason = 'wrong-role-not-driver';
    }

    const canMountDriver =
      blockReason === 'ready' &&
      authSettled &&
      roleResolved &&
      signedIn &&
      firestoreUserRole === 'driver' &&
      role === 'driver';

    return {
      canMountDriver,
      blockReason,
      authSettled,
      roleResolved,
      signedIn,
      role,
      firestoreRole: firestoreUserRole,
    };
  }, [authReady, firestoreUserRole, loading, roleResolved, user]);
}
