import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type DashboardOrderStatus = 'pending' | 'preparing' | 'ready' | 'picked_up';

export type DashboardOrder = {
  id: string;
  items: string;
  totalPrice: number;
  timeAgo: string;
  status: DashboardOrderStatus;
};

type OrderCardProps = {
  order: DashboardOrder;
  onMarkReady: (orderId: string) => void;
  onAssignDriver: (orderId: string) => void;
};

const STATUS_STYLES: Record<DashboardOrderStatus, { bg: string; text: string; label: string }> =
  {
    pending: { bg: '#F1F5F9', text: '#334155', label: 'Pending' },
    preparing: { bg: '#FFEDD5', text: '#C2410C', label: 'Preparing' },
    ready: { bg: '#DBEAFE', text: '#1D4ED8', label: 'Ready' },
    picked_up: { bg: '#DCFCE7', text: '#166534', label: 'Picked up' },
  };

export function OrderCard({ order, onMarkReady, onAssignDriver }: OrderCardProps) {
  const badge = STATUS_STYLES[order.status];
  const canMarkReady = order.status === 'preparing' || order.status === 'pending';
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.orderId}>Order #{order.id}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.items}>{order.items}</Text>
      <View style={styles.row}>
        <Text style={styles.total}>${order.totalPrice.toFixed(2)}</Text>
        <Text style={styles.time}>{order.timeAgo}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.readyButton, !canMarkReady ? styles.disabledButton : null]}
          onPress={() => onMarkReady(order.id)}
          disabled={!canMarkReady}
        >
          <Text style={styles.readyText}>Mark as Ready</Text>
        </Pressable>
        <Pressable style={styles.assignButton} onPress={() => onAssignDriver(order.id)}>
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
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontWeight: '700', fontSize: 12 },
  items: { marginTop: 8, color: '#334155', fontWeight: '600' },
  total: { marginTop: 10, color: '#0F172A', fontSize: 17, fontWeight: '800' },
  time: { marginTop: 10, color: '#64748B', fontWeight: '600' },
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignText: { color: '#334155', fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
});
