import { getRouteGroupFromPathname } from '@/lib/routing/routeConstants';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { usePathname } from 'expo-router';
import { useMemo } from 'react';

/** Whether `(host)` layout may mount — restaurant only. */
export function useHostShellAccess() {
  const pathname = usePathname();
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();

  return useMemo(() => {
    const signedIn = isRegisteredAuthUser(user);
    const role = normalizeRoleForRouting(firestoreUserRole);
    const authSettled = authReady && !loading;
    const onHostPath = getRouteGroupFromPathname(pathname) === '(host)';
    const isRestaurant = role === 'restaurant';

    const canMountHost = authSettled && roleResolved && signedIn && isRestaurant;

    // Keep shell mounted on host paths while role/auth settles — avoids blank white screen.
    const canRenderShell =
      authSettled && signedIn && onHostPath && (!roleResolved || isRestaurant);

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
    };
  }, [authReady, firestoreUserRole, loading, pathname, roleResolved, user]);
}
