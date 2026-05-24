import { DriverOrderDetailsScreen } from '@/components/orders/driver/DriverOrderDetailsScreen';
import { subscribeOrderById, type RestaurantOrder } from '@/services/orderService';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Driver-scoped marketplace order detail — stays inside `(driver)`. */
export default function DriverOrderDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id.trim() : '';
  const [order, setOrder] = useState<RestaurantOrder | null | undefined>(undefined);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return undefined;
    }
    return subscribeOrderById(orderId, (next) => {
      setOrder(next);
    });
  }, [orderId]);

  if (!orderId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.title}>Missing order</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (order === undefined) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#22C55E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.title}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <DriverOrderDetailsScreen order={order} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { color: '#F8FAFC', fontWeight: '800', fontSize: 18 },
});
