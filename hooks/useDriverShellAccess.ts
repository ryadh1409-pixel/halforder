import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useEffect, useMemo, useRef } from 'react';

export type DriverShellBlockReason =
  | 'ready'
  | 'auth-loading'
  | 'role-pending'
  | 'not-signed-in'
  | 'wrong-role-not-driver';

/** Whether `(driver)` layout may mount — active driver workspace only. */
export function useDriverShellAccess() {
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();
  const {
    ready: workspaceReady,
    routingWorkspace,
    availableWorkspaces,
  } = useActiveWorkspace();

  const uid = user?.uid ?? null;
  /** Once the driver shell has mounted for this uid, keep it mounted across hydration flaps. */
  const mountLatchedUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || routingWorkspace !== 'driver') {
      mountLatchedUidRef.current = null;
    }
  }, [uid, routingWorkspace]);

  return useMemo(() => {
    const signedIn = isRegisteredAuthUser(user);
    const role = normalizeRoleForRouting(routingWorkspace);
    const authSettled = authReady && !loading;
    const hasDriverCapability = availableWorkspaces.includes('driver');
    const mountLatched = Boolean(uid) && mountLatchedUidRef.current === uid;

    const driverWorkspace =
      routingWorkspace === 'driver' &&
      hasDriverCapability &&
      (workspaceReady || mountLatched);

    if (
      authSettled &&
      roleResolved &&
      signedIn &&
      workspaceReady &&
      routingWorkspace === 'driver' &&
      hasDriverCapability &&
      uid
    ) {
      mountLatchedUidRef.current = uid;
    }

    let blockReason: DriverShellBlockReason = 'ready';
    if (!authSettled) {
      blockReason = 'auth-loading';
    } else if (!roleResolved || (!workspaceReady && !mountLatched)) {
      blockReason = 'role-pending';
    } else if (!signedIn) {
      blockReason = 'not-signed-in';
    } else if (!driverWorkspace) {
      blockReason = 'wrong-role-not-driver';
    }

    const canMountDriver =
      blockReason === 'ready' &&
      authSettled &&
      roleResolved &&
      signedIn &&
      driverWorkspace;

    return {
      canMountDriver,
      blockReason,
      authSettled,
      roleResolved,
      signedIn,
      role,
      firestoreRole: firestoreUserRole,
      routingWorkspace,
    };
  }, [
    authReady,
    availableWorkspaces,
    firestoreUserRole,
    loading,
    roleResolved,
    routingWorkspace,
    uid,
    user,
    workspaceReady,
  ]);
}
