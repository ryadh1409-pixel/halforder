import { MarketplaceOrderTracking } from '@/components/order/MarketplaceOrderTracking';
import { HalfOrderDetailsScreen } from '@/screens/HalfOrderDetailsScreen';
import {
  looksLikeMarketplaceRestaurantOrder,
  subscribeOrderById,
  type RestaurantOrder,
} from '@/services/orderService';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Unified order route: marketplace delivery (live Firestore model) vs HalfOrder / food-card flows.
 * Single `subscribeOrderById` subscription avoids duplicate listeners on the delivery path.
 */
export default function OrderRouteScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id.trim() : '';

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
    return <MarketplaceOrderTracking order={live} />;
  }

  return <HalfOrderDetailsScreen orderId={orderId} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#06080C', padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  sub: { marginTop: 10, color: 'rgba(226,232,240,0.65)', fontWeight: '600', textAlign: 'center' },
});
