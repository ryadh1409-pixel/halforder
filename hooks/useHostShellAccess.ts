import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { getRouteGroupFromPathname } from '@/lib/routing/routeConstants';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { usePathname } from 'expo-router';
import { useMemo } from 'react';

/** Whether `(host)` layout may mount — active restaurant workspace only. */
export function useHostShellAccess() {
  const pathname = usePathname();
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();
  const {
    ready: workspaceReady,
    routingWorkspace,
    availableWorkspaces,
  } = useActiveWorkspace();

  return useMemo(() => {
    const signedIn = isRegisteredAuthUser(user);
    const role = normalizeRoleForRouting(routingWorkspace);
    const authSettled = authReady && !loading;
    const onHostPath = getRouteGroupFromPathname(pathname) === '(host)';
    const isRestaurant =
      workspaceReady &&
      routingWorkspace === 'restaurant' &&
      availableWorkspaces.includes('restaurant');

    const canMountHost =
      authSettled && roleResolved && workspaceReady && signedIn && isRestaurant;

    // Keep shell mounted on host paths while role/auth settles — avoids blank white screen.
    const canRenderShell =
      authSettled &&
      signedIn &&
      onHostPath &&
      (!roleResolved || !workspaceReady || isRestaurant);

    const showShellLoading = canRenderShell && !canMountHost;

    return {
      canMountHost,
      canRenderShell,
      showShellLoading,
      authSettled,
      roleResolved,
      signedIn,
      role,
      onHostPath,
      firestoreRole: firestoreUserRole,
    };
  }, [
    authReady,
    availableWorkspaces,
    firestoreUserRole,
    loading,
    pathname,
    roleResolved,
    routingWorkspace,
    user,
    workspaceReady,
  ]);
}
