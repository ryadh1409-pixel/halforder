import { PostPaymentLoadingShell } from '@/components/payment/PaymentNavigationBoundary';
import { resolveOrderDetailGate } from '@/lib/orderDetailGate';
import { normalizeOrderRouteId } from '@/lib/orderRouteParams';
import { useAuth } from '@/services/AuthContext';
import { Redirect, useLocalSearchParams, usePathname, useSegments } from 'expo-router';
import React, { useMemo } from 'react';

type Props = {
  children: React.ReactNode;
};

/**
 * Keeps signed-in drivers and restaurants on role-scoped order routes.
 * Customer (`user` / `admin`) accounts always render children — never driver workspace.
 */
export function RoleScopedOrderDetailGateway({ children }: Props) {
  const { authReady, roleResolved, loading, firestoreUserRole, user } = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const pathname = usePathname();
  const segments = useSegments();
  const orderId = normalizeOrderRouteId(params.id);
  const segmentList = segments as string[];
  const segmentKey = segmentList.join('/');

  const decision = useMemo(
    () =>
      resolveOrderDetailGate({
        authReady,
        loading,
        roleResolved,
        firestoreUserRole,
        userUid: user?.uid,
        orderId,
        pathname,
        segments: segmentList,
      }),
    [
      authReady,
      firestoreUserRole,
      loading,
      orderId,
      pathname,
      roleResolved,
      segmentKey,
      user?.uid,
    ],
  );

  console.log('[RoleScopedOrderDetailGateway]', {
    gateState: decision.action,
    loadingReason: decision.action === 'loading' ? decision.reason : null,
    passReason: decision.action === 'render' ? decision.reason : null,
    redirectReason: decision.action === 'redirect' ? decision.reason : null,
    roleDetected: decision.role,
    firestoreRole: decision.firestoreRole,
    customerWorkspace: decision.customerWorkspace,
    driverWorkspace: decision.driverWorkspace,
    orderId: orderId || null,
    pathname,
    segments: segmentList,
    authReady,
    roleResolved,
    authLoading: loading,
  });

  if (decision.action === 'loading') {
    return (
      <PostPaymentLoadingShell
        title="Loading order…"
        subtitle={orderId ? `Order ${orderId}` : undefined}
      />
    );
  }

  if (decision.action === 'redirect') {
    return <Redirect href={decision.href} />;
  }

  return <>{children}</>;
}
