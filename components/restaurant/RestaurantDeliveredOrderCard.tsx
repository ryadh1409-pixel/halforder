import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RestaurantOrder } from '@/services/orderService';
import { formatOrderDate, formatOrderTime } from '@/utils/orderTime';

type Props = {
  order: RestaurantOrder;
  timeZone?: string;
};

function formatDeliveredAt(ms: number | null | undefined, timeZone?: string): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  return `${formatOrderDate(ms, { timeZone })} · ${formatOrderTime(ms, { timeZone })}`;
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

export function RestaurantDeliveredOrderCard({ order, timeZone }: Props) {
  const deliveredMs = order.deliveredAtMs ?? order.completedAtMs;
  const createdMs = order.createdAtMs ?? null;
  const deliveryDurationMs =
    deliveredMs != null && createdMs != null && deliveredMs >= createdMs
      ? deliveredMs - createdMs
      : null;
  const orderNumber = order.id.slice(-6).toUpperCase();
  const customer =
    order.customerName?.trim() ||
    order.customer?.name?.trim() ||
    'Customer';
  const driver =
    order.driverName?.trim() ||
    order.driver?.name?.trim() ||
    'Driver';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.orderNumber}>#{orderNumber}</Text>
        <Text style={styles.amount}>${order.totalPrice.toFixed(2)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.label}>Customer</Text>
        <Text style={styles.value}>{customer}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.label}>Driver</Text>
        <Text style={styles.value}>{driver}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.label}>Delivered</Text>
        <Text style={styles.value}>{formatDeliveredAt(deliveredMs, timeZone)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.label}>Duration</Text>
        <Text style={styles.value}>{formatDurationMs(deliveryDurationMs)}</Text>
      </View>
      {order.driverPayout != null ? (
        <View style={styles.metaRow}>
          <Text style={styles.label}>Driver payout</Text>
          <Text style={styles.value}>${order.driverPayout.toFixed(2)}</Text>
        </View>
      ) : null}
      {order.platformFee != null ? (
        <View style={styles.metaRow}>
          <Text style={styles.label}>Platform fee</Text>
          <Text style={styles.value}>${order.platformFee.toFixed(2)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 14,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderNumber: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  amount: { fontSize: 16, fontWeight: '900', color: '#16a34a' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  value: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
});
