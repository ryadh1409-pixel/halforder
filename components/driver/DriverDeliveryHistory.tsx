import type { DriverOrder } from '@/services/driverService';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function formatCompletedAt(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return 'Recently';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    value || 0,
  );
}

type Props = {
  orders: DriverOrder[];
  maxItems?: number;
};

export function DriverDeliveryHistory({ orders, maxItems = 10 }: Props) {
  const visible = orders.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No completed deliveries yet</Text>
        <Text style={styles.emptySub}>Finished trips appear here after you complete a drop-off.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {visible.map((order) => (
        <View key={order.id} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.restaurant} numberOfLines={1}>
              {order.restaurantName || 'Restaurant'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {order.deliveryAddress ?? 'Delivery'}
            </Text>
            <Text style={styles.time}>{formatCompletedAt(order.deliveredAtMs)}</Text>
          </View>
          <View style={styles.earnings}>
            <Text style={styles.earningsValue}>
              {money(order.deliveryFee > 0 ? order.deliveryFee : order.total)}
            </Text>
            <Text style={styles.earningsLabel}>Earned</Text>
          </View>
        </View>
      ))}
      {orders.length > maxItems ? (
        <Text style={styles.more}>+{orders.length - maxItems} more completed</Text>
      ) : null}
    </View>
  );
}

/** Collapsible section wrapper for Driver Hub. */
export function DriverDeliveryHistorySection({
  orders,
  expanded,
  onToggleExpanded,
}: {
  orders: DriverOrder[];
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={onToggleExpanded}>
        <Text style={styles.sectionTitle}>Completed deliveries</Text>
        <Text style={styles.sectionCount}>{orders.length}</Text>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded ? <DriverDeliveryHistory orders={orders} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: { flex: 1, color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  sectionCount: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chevron: { color: '#94A3B8', fontSize: 16, fontWeight: '700' },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 14,
    gap: 12,
  },
  rowMain: { flex: 1, gap: 4 },
  restaurant: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  meta: { color: '#94A3B8', fontSize: 13 },
  time: { color: '#64748B', fontSize: 12 },
  earnings: { alignItems: 'flex-end' },
  earningsValue: { color: '#4ADE80', fontSize: 16, fontWeight: '800' },
  earningsLabel: { color: '#64748B', fontSize: 11, marginTop: 2 },
  more: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 4 },
  emptyCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
    gap: 6,
  },
  emptyTitle: { color: '#CBD5E1', fontSize: 15, fontWeight: '700' },
  emptySub: { color: '#64748B', fontSize: 13, lineHeight: 18 },
});
