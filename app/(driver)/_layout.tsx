import { PostPaymentLoadingShell } from '@/components/payment/PaymentNavigationBoundary';
import { DriverStackGate } from '@/components/driver/DriverStackGate';
import { useDriverShellAccess } from '@/hooks/useDriverShellAccess';
import { isInDriverGroup } from '@/lib/routing/routeConstants';
import { usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';

export const unstable_settings = {
  initialRouteName: 'index',
};

/**
 * Driver shell — mounts only for `/(driver)/*` routes, never for root `/order/:id`.
 */
export default function DriverLayout() {
  const access = useDriverShellAccess();
  const pathname = usePathname();
  const segments = useSegments();
  const segmentList = segments as string[];
  const router = useRouter();
  const hasEjected = useRef(false);

  const { authSettled, roleResolved, firestoreRole } = access;
  const inDriverGroup = isInDriverGroup(segmentList, pathname);
  const shouldEject =
    inDriverGroup &&
    authSettled &&
    roleResolved &&
    firestoreRole !== 'driver';

  console.log('[DriverLayout]', {
    pathname,
    segments: segmentList,
    routeGroup: inDriverGroup ? '(driver)' : 'not-driver',
    inDriverGroup,
    firestoreRole,
    shouldEject,
    blockReason: access.blockReason,
  });

  useEffect(() => {
    if (!shouldEject || hasEjected.current) return;

    hasEjected.current = true;
    const target = '/(tabs)';

    console.log('[DriverLayout] eject non-driver once', {
      redirectSource: pathname,
      redirectTarget: target,
      firestoreRole,
    });

    router.replace(target);
  }, [authSettled, roleResolved, firestoreRole, pathname, router, shouldEject]);

  useEffect(() => {
    if (!hasEjected.current) return;
    console.log('[DriverLayout] pathname after eject', { pathname, segments: segmentList });
  }, [pathname, segmentList]);

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
