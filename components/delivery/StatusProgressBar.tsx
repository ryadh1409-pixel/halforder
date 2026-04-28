import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DeliveryStatus } from '@/services/deliveryTracking';

const STEPS: DeliveryStatus[] = [
  'waiting',
  'matched',
  'preparing',
  'picked_up',
  'on_the_way',
  'delivered',
];

const LABELS: Record<DeliveryStatus, string> = {
  waiting: 'Waiting',
  matched: 'Matched',
  preparing: 'Preparing',
  picked_up: 'Picked Up',
  on_the_way: 'On the Way',
  delivered: 'Delivered',
};

export function StatusProgressBar({ status }: { status: DeliveryStatus }) {
  const activeIndex = STEPS.indexOf(status);
  return (
    <View style={styles.row}>
      {STEPS.map((step, index) => {
        const active = index <= activeIndex;
        return (
          <View key={step} style={styles.item}>
            <View style={[styles.dot, active && styles.dotActive]} />
            <Text style={[styles.label, active && styles.labelActive]}>
              {LABELS[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  item: {
    alignItems: 'center',
    width: '30%',
    minWidth: 92,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#CBD5E1',
    marginBottom: 4,
  },
  dotActive: {
    backgroundColor: '#2563EB',
  },
  label: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelActive: {
    color: '#0F172A',
  },
});
