import { PostPaymentLoadingShell } from '@/components/payment/PaymentNavigationBoundary';
import { orderDetailHref } from '@/lib/orderRoutes';
import { normalizeOrderRouteId } from '@/lib/orderRouteParams';
import { isInDriverGroup, isInHostGroup } from '@/lib/routing/routeConstants';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { useAuth } from '@/services/AuthContext';
import { Redirect, useLocalSearchParams, usePathname, useSegments } from 'expo-router';
import React from 'react';

type Props = {
  children: React.ReactNode;
};

/**
 * Keeps signed-in drivers and restaurants on role-scoped order routes
 * instead of the shared `/order/[id]` entry.
 */
export function RoleScopedOrderDetailGateway({ children }: Props) {
  const { authReady, roleResolved, loading, firestoreUserRole, user } = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const pathname = usePathname();
  const segments = useSegments();
  const orderId = normalizeOrderRouteId(params.id);
  const role = normalizeRoleForRouting(firestoreUserRole);
  const segmentList = segments as string[];

  console.log('[RoleScopedOrderDetailGateway]', {
    rawId: params.id,
    orderId: orderId || null,
    role,
    roleResolved,
    authReady,
    loading,
    pathname,
    segments: segmentList,
  });

  if (!authReady || loading) {
    return (
      <PostPaymentLoadingShell
        title="Loading order…"
        subtitle={orderId ? `Order ${orderId}` : undefined}
      />
    );
  }

  if (!user?.uid || !orderId) {
    return <>{children}</>;
  }

  if (!roleResolved) {
    return <>{children}</>;
  }

  if (role === 'driver' && !isInDriverGroup(segmentList, pathname)) {
    if (__DEV__) {
      console.warn('[Route assertion] driver on shared /order — redirecting to (driver) order', {
        orderId,
        pathname,
        segments: segmentList,
      });
    }
    return <Redirect href={orderDetailHref('driver', orderId)} />;
  }

  if (role === 'restaurant' && !isInHostGroup(segmentList, pathname)) {
    if (__DEV__) {
      console.warn('[Route assertion] restaurant on shared /order — redirecting to (host) order', {
        orderId,
        pathname,
        segments: segmentList,
      });
    }
    return <Redirect href={orderDetailHref('restaurant', orderId)} />;
  }

  return <>{children}</>;
}
