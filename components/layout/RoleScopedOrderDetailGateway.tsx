import { orderDetailHref } from '@/lib/orderRoutes';
import { isInDriverGroup, isInHostGroup } from '@/lib/routing/routeConstants';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { useAuth } from '@/services/AuthContext';
import { Redirect, useLocalSearchParams, usePathname, useSegments } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

type Props = {
  children: React.ReactNode;
};

/**
 * Keeps signed-in drivers and restaurants on role-scoped order routes
 * instead of the shared `/order/[id]` entry.
 */
export function RoleScopedOrderDetailGateway({ children }: Props) {
  const { authReady, roleResolved, loading, firestoreUserRole, user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const pathname = usePathname();
  const segments = useSegments();
  const orderId = typeof id === 'string' ? id.trim() : '';
  const role = normalizeRoleForRouting(firestoreUserRole);
  const segmentList = segments as string[];

  if (!authReady || loading || !roleResolved) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1A6FE8" />
      </View>
    );
  }

  if (!user?.uid || !orderId) {
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

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F8F8' },
});
