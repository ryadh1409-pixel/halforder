import { PaymentBadge } from '@/components/orders/StatusBadge';
import {
  isRestaurantOrderCancelled,
  isRestaurantOrderDelivered,
} from '@/constants/restaurantOrderFilters';
import type { RestaurantOrder } from '@/services/orderService';
import { getRestaurantOrderPresentation } from '@/services/orderStage';
import { formatOrderDate, formatOrderTime } from '@/utils/orderTime';
import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  order: RestaurantOrder;
  timeZone?: string;
};

function formatTs(ms: number | null | undefined, timeZone?: string): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  return `${formatOrderDate(ms, { timeZone })} · ${formatOrderTime(ms, { timeZone })}`;
}

function money(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '$0.00';
  return `CA$${n.toFixed(2)}`;
}

export function RestaurantArchiveOrderCard({ order, timeZone }: Props) {
  const [expanded, setExpanded] = useState(false);
  const presentation = useMemo(() => getRestaurantOrderPresentation(order), [order]);
  const orderNumber = order.id.slice(-6).toUpperCase();
  const customer =
    order.customerName?.trim() || order.customer?.name?.trim() || 'Customer';
  const itemCount = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + (item.qty ?? 1), 0)
    : 0;
  const cancelled = isRestaurantOrderCancelled(order);
  const completed = isRestaurantOrderDelivered(order);
  const statusLabel = cancelled ? 'Cancelled' : completed ? 'Completed' : presentation.badgeText;
  const fulfillment = order.deliveryType === 'pickup' ? 'Pickup' : 'Delivery';
  const paymentStatus = order.paymentStatus === 'paid' ? 'paid' : order.paymentStatus;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <Pressable
      onPress={toggle}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Order ${orderNumber} details`}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.customer}>{customer}</Text>
          <Text style={styles.orderNo}>#{orderNumber}</Text>
        </View>
        <View style={[styles.statusPill, cancelled ? styles.statusCancel : styles.statusDone]}>
          <Text style={[styles.statusText, cancelled ? styles.statusCancelText : styles.statusDoneText]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.meta}>{formatTs(order.createdAtMs, timeZone)}</Text>
        <Text style={styles.total}>{money(order.totalPrice)}</Text>
      </View>

      <View style={styles.chipRow}>
        <PaymentBadge paymentStatus={paymentStatus} />
        <View style={styles.chip}>
          <Text style={styles.chipText}>{fulfillment}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{itemCount} items</Text>
        </View>
      </View>

      {expanded ? (
        <View style={styles.details}>
          <Text style={styles.sectionTitle}>Order details</Text>
          {(order.items ?? []).map((item, index) => (
            <Text key={`${order.id}-a-${index}`} style={styles.itemLine}>
              Qty {item.qty ?? 1} · {item.name ?? 'Item'}
            </Text>
          ))}
          {(order.items ?? []).length === 0 ? (
            <Text style={styles.muted}>No items listed</Text>
          ) : null}

          <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Payment summary</Text>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Total</Text>
            <Text style={styles.payValue}>{money(order.totalPrice)}</Text>
          </View>
          {order.platformFee != null ? (
            <View style={styles.payRow}>
              <Text style={styles.payLabel}>Platform fee</Text>
              <Text style={styles.payValue}>{money(order.platformFee)}</Text>
            </View>
          ) : null}
          {order.driverPayout != null ? (
            <View style={styles.payRow}>
              <Text style={styles.payLabel}>Driver payout</Text>
              <Text style={styles.payValue}>{money(order.driverPayout)}</Text>
            </View>
          ) : null}
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Payment</Text>
            <Text style={styles.payValue}>{String(paymentStatus)}</Text>
          </View>

          <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Timestamps</Text>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Placed</Text>
            <Text style={styles.payValue}>{formatTs(order.createdAtMs, timeZone)}</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Completed</Text>
            <Text style={styles.payValue}>
              {formatTs(order.completedAtMs ?? order.deliveredAtMs, timeZone)}
            </Text>
          </View>
          <Text style={styles.readOnly}>Archive is read-only</Text>
        </View>
      ) : (
        <Text style={styles.tapHint}>Tap for full details</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 12,
  },
  pressed: { opacity: 0.96 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  customer: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  orderNo: { marginTop: 2, fontSize: 13, fontWeight: '700', color: '#64748B' },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusDone: { backgroundColor: '#DCFCE7' },
  statusCancel: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 12, fontWeight: '800' },
  statusDoneText: { color: '#166534' },
  statusCancelText: { color: '#991B1B' },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: { fontSize: 13, fontWeight: '600', color: '#64748B', flex: 1 },
  total: { fontSize: 17, fontWeight: '900', color: '#A855F7' },
  chipRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  details: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionSpaced: { marginTop: 14 },
  itemLine: { fontSize: 14, fontWeight: '600', color: '#334155', lineHeight: 20 },
  muted: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 3,
  },
  payLabel: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  payValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  readOnly: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
  },
  tapHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
