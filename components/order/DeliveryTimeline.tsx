import type { OrderStatus } from '@/services/orderService';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Step = { status: OrderStatus; label: string };

export function DeliveryTimeline({
  steps,
  status,
  variant = 'light',
}: {
  steps: Step[];
  status: OrderStatus;
  variant?: 'light' | 'dark';
}) {
  const activeIdx = Math.max(steps.findIndex((step) => step.status === status), 0);
  const isDark = variant === 'dark';
  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>Timeline</Text>
      {steps.map((step, idx) => {
        const done = idx <= activeIdx;
        return (
          <View key={step.status} style={styles.row}>
            <View style={[styles.dot, isDark && styles.dotDark, done && styles.dotOn]} />
            <Text style={[styles.label, isDark && styles.labelDark, done && styles.labelOn, done && isDark && styles.labelOnDark]}>
              {step.label}
            </Text>
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
  cardDark: {
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0E1218',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  titleDark: { color: '#F8FAFC' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#CBD5E1', marginRight: 12 },
  dotDark: { backgroundColor: 'rgba(148,163,184,0.35)' },
  dotOn: { backgroundColor: '#22C55E' },
  label: { color: '#64748B', fontWeight: '600', flex: 1 },
  labelDark: { color: 'rgba(148,163,184,0.95)' },
  labelOn: { color: '#0F172A', fontWeight: '800' },
  labelOnDark: { color: '#F8FAFC' },
});
