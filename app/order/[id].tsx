import { RoleScopedOrderDetailGateway } from '@/components/layout/RoleScopedOrderDetailGateway';
import OrderDetailScreen from '@/components/order/OrderDetailScreen';
import { PaymentNavigationBoundary } from '@/components/payment/PaymentNavigationBoundary';
import { normalizeOrderRouteId } from '@/lib/orderRouteParams';
import { getRouteGroup, isInDriverGroup } from '@/lib/routing/routeConstants';
import { useLocalSearchParams, usePathname, useSegments } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

if (__DEV__) {
  console.log('[ORDER ROUTE] module loaded app/order/[id].tsx');
}

/**
 * Expo Router entry for `/order/:id` (file: `app/order/[id].tsx`).
 * Customer tracking uses deliveryStatus-first stage resolution via useMarketplaceOrderDetail.
 */
export default function OrderDetailRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const pathname = usePathname();
  const segments = useSegments();
  const orderId = normalizeOrderRouteId(params.id);

  const segmentList = segments as string[];
  const routeGroup = getRouteGroup(segmentList, pathname);

  console.log('[ORDER ROUTE PARAMS]', {
    params,
    pathname,
    segments: segmentList,
    routeGroup,
    inDriverGroup: isInDriverGroup(segmentList, pathname),
    orderId: orderId || null,
  });

  if (isInDriverGroup(segmentList, pathname)) {
    console.error(
      '[ORDER ROUTE] mounted under (driver) — duplicate route; expected root app/order/[id] only',
    );
  }

  if (!orderId) {
    return (
      <SafeAreaView style={styles.shell} edges={['top', 'bottom']}>
        <Text style={styles.title}>Missing order id</Text>
        <Text style={styles.sub}>
          Route matched `app/order/[id].tsx` but no `id` param was provided.
        </Text>
        <Text style={styles.debug} selectable>
          {`pathname: ${pathname}\nsegments: ${JSON.stringify(segments)}`}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <PaymentNavigationBoundary screenName="order/[id]">
      <RoleScopedOrderDetailGateway>
        <OrderDetailScreen />
      </RoleScopedOrderDetailGateway>
    </PaymentNavigationBoundary>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 24,
    justifyContent: 'center',
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  sub: { color: '#7D8493', marginTop: 8, fontSize: 14, lineHeight: 20 },
  debug: { color: '#7D8493', marginTop: 16, fontSize: 12, fontFamily: 'monospace' },
});
