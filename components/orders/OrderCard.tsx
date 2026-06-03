import OrderActions from '@/components/orders/OrderActions';
import { PaymentBadge, StatusBadge } from '@/components/orders/StatusBadge';
import { merchantStatusFromOrder } from '@/components/orders/statusFlow';
import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import type { OrderStatus, RestaurantOrder } from '@/services/orderService';
import { formatOrderTime } from '@/utils/time';
import { formatRestaurantOrderPlacedLabel } from '@/utils/orderTime';
import { platformElevation } from '@/utils/platformElevation';
import React, { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  order: RestaurantOrder;
  timeZone?: string;
  onPress?: () => void;
  onStatus: (status: OrderStatus) => void;
  onReject: () => void;
  loading?: boolean;
};

export default function OrderCard({
  order,
  timeZone,
  onPress,
  onStatus,
  onReject,
  loading,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const merchantStatus = merchantStatusFromOrder(order);
  const itemPreview = useMemo(
    () => order.items.map((i) => `${i.qty}× ${i.name}`).join(' · '),
    [order.items],
  );
  const placedLabel = useMemo(
    () => formatRestaurantOrderPlacedLabel(order.createdAtMs, timeZone),
    [order.createdAtMs, timeZone],
  );
  const updatedLabel = useMemo(() => {
    const anchor = order.deliveredAtMs ?? order.createdAtMs;
    if (!anchor) return null;
    return formatOrderTime(anchor, { timeZone });
  }, [order.createdAtMs, order.deliveredAtMs, timeZone]);

  if (!isOrderFresh(order)) return null;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={styles.card}
        onPress={onPress}
        disabled={!onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
        }
      >
        <View style={styles.top}>
          <View style={styles.topCopy}>
            <Text style={styles.customer} numberOfLines={1}>
              {order.customerName ?? `Guest ${order.userId.slice(0, 6)}`}
            </Text>
            <Text style={styles.id}>#{order.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.time}>{placedLabel}</Text>
          </View>
          <StatusBadge status={order.status} />
        </View>

        <Text style={styles.preview} numberOfLines={2}>
          {itemPreview || 'No items'}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {order.deliveryLocation?.address ? 'Delivery' : 'Pickup'}
          </Text>
          {order.driverName ? (
            <Text style={styles.meta} numberOfLines={1}>
              Driver · {order.driverName}
            </Text>
          ) : (
            <Text style={styles.meta}>Prep ~{order.estimatedDeliveryTime} min</Text>
          )}
          <PaymentBadge paymentStatus={order.paymentStatus} />
        </View>

        <View style={styles.bottom}>
          <View>
            <Text style={styles.total}>${order.totalPrice.toFixed(2)}</Text>
            {updatedLabel ? (
              <Text style={styles.updatedSub}>{updatedLabel}</Text>
            ) : null}
          </View>
          {onPress ? <Text style={styles.link}>Details</Text> : null}
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
    paddingTop: 16,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 48,
    marginBottom: 12,
    ...platformElevation({
      web: '0px 3px 10px rgba(15, 23, 42, 0.06)',
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  topCopy: { flex: 1, minWidth: 0 },
  customer: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  id: { marginTop: 4, color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  time: { marginTop: 2, color: '#64748b', fontWeight: '600', fontSize: 13 },
  preview: {
    marginTop: 12,
    color: '#334155',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  meta: { color: '#64748B', fontWeight: '700', fontSize: 12 },
  bottom: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  total: { color: '#0F172A', fontSize: 20, fontWeight: '800' },
  updatedSub: { marginTop: 2, color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  link: { color: '#16a34a', fontWeight: '800', fontSize: 14 },
});
