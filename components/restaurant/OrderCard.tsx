import type { OrderStageInput } from '@/services/orderStage';
import { getRestaurantOrderPresentation } from '@/services/orderStage';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type DashboardOrder = OrderStageInput & {
  id: string;
  items: string;
  totalPrice: number;
  timeAgo: string;
};

type OrderCardProps = {
  order: DashboardOrder;
  onMarkReady: (orderId: string) => void;
  onAssignDriver: (orderId: string) => void;
};

/** Legacy compact card — UI from {@link getRestaurantOrderPresentation} only. */
export function OrderCard({ order, onMarkReady, onAssignDriver }: OrderCardProps) {
  const presentation = useMemo(() => getRestaurantOrderPresentation(order), [order]);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.orderId}>Order #{order.id}</Text>
        <View style={[styles.badge, { backgroundColor: presentation.badgeColor.bg }]}>
          <Text style={[styles.badgeText, { color: presentation.badgeColor.fg }]}>
            {presentation.badgeText}
          </Text>
        </View>
      </View>
      <Text style={styles.items}>{order.items}</Text>
      <View style={styles.row}>
        <Text style={styles.total}>${order.totalPrice.toFixed(2)}</Text>
        <Text style={styles.time}>{order.timeAgo}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.readyButton, !presentation.canReady ? styles.disabledButton : null]}
          onPress={() => onMarkReady(order.id)}
          disabled={!presentation.canReady}
        >
          <Text style={styles.readyText}>Mark as Ready</Text>
        </Pressable>
        <Pressable
          style={[styles.assignButton, !presentation.canAssignDriver ? styles.disabledButton : null]}
          onPress={() => onAssignDriver(order.id)}
          disabled={!presentation.canAssignDriver}
        >
          <Text style={styles.assignText}>Assign Driver</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000000',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontWeight: '700', fontSize: 12 },
  items: { marginTop: 8, color: '#B7BDC9', fontWeight: '600' },
  total: { marginTop: 10, color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  time: { marginTop: 10, color: '#7D8493', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  readyButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyText: { color: '#FFFFFF', fontWeight: '800' },
  assignButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignText: { color: '#B7BDC9', fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
});
