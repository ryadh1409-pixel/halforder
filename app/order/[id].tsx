import { CustomerOrderDetailsScreen } from '@/components/orders/customer/CustomerOrderDetailsScreen';
import { DriverOrderDetailsScreen } from '@/components/orders/driver/DriverOrderDetailsScreen';
import { RestaurantOrderDetailsScreen } from '@/components/orders/restaurant/RestaurantOrderDetailsScreen';
import { HalfOrderDetailsScreen } from '@/screens/HalfOrderDetailsScreen';
import { useAuth } from '@/services/AuthContext';
import {
  looksLikeMarketplaceRestaurantOrder,
  subscribeOrderById,
  type RestaurantOrder,
} from '@/services/orderService';
import { resolveMarketplaceOrderViewerRole } from '@/services/orderViewerRole';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Marketplace orders route by viewer role (customer / driver / restaurant / admin).
 * HalfOrder / food-card flows keep `HalfOrderDetailsScreen`.
 */
export default function OrderRouteScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id.trim() : '';
  const { user, firestoreUserRole } = useAuth();

  const [live, setLive] = useState<RestaurantOrder | null | undefined>(undefined);

  useEffect(() => {
    if (!orderId) {
      setLive(null);
      return undefined;
    }

    const unsub = subscribeOrderById(
      orderId,
      (next) => {
        console.log('LIVE ORDER:', orderId, next?.status ?? 'null');
        setLive(next);
      },
      {
        onListenError: (err) => {
          console.warn('[OrderRouteScreen] live listener warning', orderId, err.message);
        },
      },
    );
    return unsub;
  }, [orderId]);

  const viewerRole = useMemo(() => {
    if (!live || !looksLikeMarketplaceRestaurantOrder(live)) return null;
    return resolveMarketplaceOrderViewerRole(live, user?.uid, firestoreUserRole);
  }, [live, user?.uid, firestoreUserRole]);

  if (!orderId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.title}>Missing order</Text>
        <Text style={styles.sub}>This link does not include an order id.</Text>
      </SafeAreaView>
    );
  }

  if (live === undefined) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#34D399" />
          <Text style={styles.sub}>Loading order…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (live && looksLikeMarketplaceRestaurantOrder(live)) {
    if (viewerRole === 'restaurant') {
      return <RestaurantOrderDetailsScreen order={live} />;
    }
    if (viewerRole === 'driver') {
      return <DriverOrderDetailsScreen order={live} />;
    }
    return <CustomerOrderDetailsScreen order={live} />;
  }

  return <HalfOrderDetailsScreen orderId={orderId} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#06080C', padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  sub: { marginTop: 10, color: 'rgba(226,232,240,0.65)', fontWeight: '600', textAlign: 'center' },
});
