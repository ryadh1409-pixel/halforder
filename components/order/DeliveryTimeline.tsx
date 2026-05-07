import type { OrderStatus } from '@/services/orderService';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Step = { status: OrderStatus; label: string };

export function DeliveryTimeline({
  steps,
  status,
}: {
  steps: Step[];
  status: OrderStatus;
}) {
  const activeIdx = Math.max(steps.findIndex((step) => step.status === status), 0);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Timeline</Text>
      {steps.map((step, idx) => {
        const done = idx <= activeIdx;
        return (
          <View key={step.status} style={styles.row}>
            <View style={[styles.dot, done && styles.dotOn]} />
            <Text style={[styles.label, done && styles.labelOn]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#CBD5E1', marginRight: 12 },
  dotOn: { backgroundColor: '#22C55E' },
  label: { color: '#64748B', fontWeight: '600', flex: 1 },
  labelOn: { color: '#0F172A', fontWeight: '800' },
});
