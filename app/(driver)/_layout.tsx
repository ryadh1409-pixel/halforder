import { PostPaymentLoadingShell } from '@/components/payment/PaymentNavigationBoundary';
import { DriverStackGate } from '@/components/driver/DriverStackGate';
import { useDriverShellAccess } from '@/hooks/useDriverShellAccess';
import { normalizeOrderRouteId } from '@/lib/orderRouteParams';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';

export const unstable_settings = {
  initialRouteName: 'index',
};

function extractOrderIdFromPath(pathname: string): string {
  const match = pathname.match(/\/order\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]).trim() : '';
}

/**
 * Driver shell only — customers must never stay here (root `/order/:id` is outside this group).
 */
export default function DriverLayout() {
  const access = useDriverShellAccess();
  const pathname = usePathname();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const orderIdFromParams = normalizeOrderRouteId(params.id);
  const hasEjected = useRef(false);

  const orderId = orderIdFromParams || extractOrderIdFromPath(pathname);
  const { authSettled, roleResolved, firestoreRole } = access;
  const shouldEject =
    authSettled && roleResolved && firestoreRole !== 'driver';

  useEffect(() => {
    if (!shouldEject || hasEjected.current) return;

    hasEjected.current = true;
    const target = orderId ? `/order/${encodeURIComponent(orderId)}` : '/(tabs)';

    console.log('[DriverLayout] eject non-driver once', {
      redirectSource: pathname,
      redirectTarget: target,
      firestoreRole,
      orderId: orderId || null,
    });

    router.replace(target);
  }, [authSettled, roleResolved, firestoreRole, orderId, router, shouldEject]);

  useEffect(() => {
    if (!hasEjected.current) return;
    console.log('[DriverLayout] pathname after eject', { pathname });
  }, [pathname]);

  if (shouldEject || hasEjected.current) {
    return null;
  }

  if (!access.canMountDriver) {
    const loadingReason =
      access.blockReason === 'auth-loading'
        ? 'auth-loading'
        : access.blockReason === 'role-pending'
          ? 'role-pending'
          : access.blockReason === 'not-signed-in'
            ? 'not-signed-in'
            : 'driver-shell-not-ready';

    return (
      <PostPaymentLoadingShell
        title="Loading driver workspace…"
        subtitle={loadingReason}
      />
    );
  }

  return <DriverStackGate />;
}
