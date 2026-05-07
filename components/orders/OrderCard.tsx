import OrderActions from '@/components/orders/OrderActions';
import { PaymentBadge, StatusBadge } from '@/components/orders/StatusBadge';
import { normalizeMerchantStatus } from '@/components/orders/statusFlow';
import type { OrderStatus, RestaurantOrder } from '@/services/orderService';
import React, { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

function relativeTime(createdAtMs: number | null): string {
  if (!createdAtMs) return 'just now';
  const diff = Date.now() - createdAtMs;
  const min = Math.max(1, Math.floor(diff / 60000));
  return `${min} min ago`;
}

type Props = {
  order: RestaurantOrder;
  onPress: () => void;
  onStatus: (status: OrderStatus) => void;
  onReject: () => void;
  loading?: boolean;
};

export default function OrderCard({ order, onPress, onStatus, onReject, loading }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const merchantStatus = normalizeMerchantStatus(order.status);
  const itemPreview = useMemo(
    () => order.items.map((i) => `${i.name} x${i.qty}`).join(', '),
    [order.items],
  );
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={styles.card}
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
        }
      >
        <View style={styles.top}>
          <View>
            <Text style={styles.customer}>{order.customerName ?? `Customer ${order.userId.slice(0, 6)}…`}</Text>
            <Text style={styles.id}>#{order.id.slice(0, 8)} · {relativeTime(order.createdAtMs)}</Text>
          </View>
          <StatusBadge status={order.status} />
        </View>
        <Text style={styles.preview} numberOfLines={1}>{itemPreview || 'No items'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{order.deliveryLocation?.address ? 'Delivery' : 'Pickup'}</Text>
          <Text style={styles.meta}>Prep ~{order.estimatedDeliveryTime}m</Text>
          <PaymentBadge paymentStatus={order.paymentStatus} />
        </View>
        <View style={styles.bottom}>
          <Text style={styles.total}>${order.totalPrice.toFixed(2)}</Text>
          <Text style={styles.link}>View Details</Text>
        </View>
        <OrderActions
          status={merchantStatus}
          loading={loading}
          onAccept={() => onStatus('accepted')}
          onStartPreparing={() => onStatus('preparing')}
          onMarkReady={() => onStatus('ready')}
          onReject={onReject}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  customer: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  id: { marginTop: 4, color: '#64748B', fontWeight: '600' },
  preview: { marginTop: 10, color: '#334155', fontWeight: '600' },
  metaRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { color: '#64748B', fontWeight: '700' },
  bottom: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  link: { color: '#2563EB', fontWeight: '700' },
});
