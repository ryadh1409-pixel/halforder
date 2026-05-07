import type { OrderStatus } from '@/services/orderService';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const STEPS: Array<{ key: string; label: string; statuses: OrderStatus[] }> = [
  { key: 'pending', label: 'Pending', statuses: ['pending', 'awaiting_payment'] },
  { key: 'accepted', label: 'Accepted', statuses: ['accepted', 'restaurant_accepted'] },
  { key: 'preparing', label: 'Preparing', statuses: ['preparing'] },
  { key: 'ready', label: 'Ready', statuses: ['ready', 'ready_for_pickup'] },
  { key: 'picked_up', label: 'Picked up', statuses: ['picked_up'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered'] },
];

export default function OrderTimeline({ status }: { status: OrderStatus }) {
  const activeIdx = STEPS.findIndex((step) => step.statuses.includes(status));
  return (
    <View>
      {STEPS.map((step, idx) => {
        const on = idx <= (activeIdx >= 0 ? activeIdx : 0);
        return (
          <View key={step.key} style={styles.row}>
            <View style={[styles.dot, on && styles.dotOn]} />
            <Text style={[styles.label, on && styles.labelOn]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10, backgroundColor: '#CBD5E1' },
  dotOn: { backgroundColor: '#22C55E' },
  label: { color: '#64748B', fontWeight: '600' },
  labelOn: { color: '#0F172A', fontWeight: '800' },
});
