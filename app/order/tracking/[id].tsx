import { useLocalSearchParams } from 'expo-router';
import { subscribeOrderById, type RestaurantOrder } from '@/services/orderService';
import { showNotice } from '@/utils/toast';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUS_STEPS = ['Restaurant preparing', 'Order accepted', 'Driver on the way', 'Delivered'] as const;

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [order, setOrder] = useState<RestaurantOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const lastStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const unsub = subscribeOrderById(id, (next) => {
      setOrder(next);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  const statusLabel = useMemo(() => {
    if (!order) return 'Restaurant preparing';
    if (order.status === 'pending') return 'Restaurant preparing';
    if (order.status === 'accepted') return 'Order accepted';
    if (order.status === 'on_the_way') return 'Driver on the way';
    return 'Delivered';
  }, [order]);
  const activeStepIndex = useMemo(
    () => STATUS_STEPS.findIndex((step) => step === statusLabel),
    [statusLabel],
  );

  useEffect(() => {
    if (!order?.status) return;
    const prev = lastStatusRef.current;
    if (prev === order.status) return;
    if (order.status === 'accepted') {
      showNotice('Order Update', 'Your order was accepted by the restaurant.');
    }
    if (order.status === 'on_the_way') {
      showNotice('Order Update', 'Your driver is on the way.');
    }
    lastStatusRef.current = order.status;
  }, [order?.status]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.orderId}>Order #{id ?? 'demo-order'}</Text>
        <Text style={styles.statusTitle}>{statusLabel}</Text>
        {order?.estimatedDeliveryTime ? (
          <View style={styles.fastBadge}>
            <Text style={styles.fastBadgeText}>Fast delivery badge · ETA {order.estimatedDeliveryTime} min</Text>
          </View>
        ) : null}

        {order ? (
          <View style={styles.orderMetaCard}>
            {order.groupId ? (
              <View style={styles.groupBanner}>
                <Text style={styles.groupTitle}>Your order is grouped for faster delivery 🚀</Text>
                <Text style={styles.groupSub}>Grouped delivery = cheaper</Text>
                <Text style={styles.groupSub}>Original delivery fee: $5.00</Text>
                <Text style={styles.groupDiscount}>New: $2.50</Text>
              </View>
            ) : null}
            <Text style={styles.orderMetaText}>Driver: {order.driverName ?? 'Waiting for driver assignment'}</Text>
            <Text style={styles.orderMetaText}>Restaurant: {order.restaurantId}</Text>
            <Text style={styles.orderMetaText}>Total: ${order.totalPrice.toFixed(2)}</Text>
            <Text style={styles.orderMetaText}>Estimated delivery: {order.estimatedDeliveryTime} min</Text>
            <Text style={styles.orderMetaText}>Delivery: {order.deliveryLocation?.address ?? 'No address yet'}</Text>
            <Text style={styles.orderMetaText}>Items:</Text>
            {order.items.map((item) => (
              <Text key={`${item.id}-${item.name}`} style={styles.orderMetaText}>
                {item.qty}x {item.name} - ${item.price.toFixed(2)}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.stepsWrap}>
          {STATUS_STEPS.map((step, idx) => {
            const done = idx <= activeStepIndex;
            return (
              <View key={step} style={styles.stepRow}>
                <View style={[styles.stepDot, done && styles.stepDotActive]} />
                <Text style={[styles.stepText, done && styles.stepTextActive]}>{step}</Text>
              </View>
            );
          })}
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1, padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orderId: { color: '#64748B', fontWeight: '600' },
  statusTitle: { marginTop: 4, color: '#0F172A', fontSize: 30, fontWeight: '800' },
  fastBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fastBadgeText: { color: '#1E3A8A', fontWeight: '800', fontSize: 12 },
  orderMetaCard: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  orderMetaText: { color: '#334155', fontWeight: '600', marginBottom: 4 },
  groupBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    padding: 10,
    marginBottom: 10,
  },
  groupTitle: { color: '#166534', fontWeight: '800', marginBottom: 4 },
  groupSub: { color: '#15803D', fontWeight: '600' },
  groupDiscount: { color: '#166534', fontWeight: '800', marginTop: 2 },
  stepsWrap: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
    marginRight: 10,
  },
  stepDotActive: { backgroundColor: '#2563EB' },
  stepText: { color: '#64748B', fontWeight: '600' },
  stepTextActive: { color: '#0F172A', fontWeight: '800' },
});
