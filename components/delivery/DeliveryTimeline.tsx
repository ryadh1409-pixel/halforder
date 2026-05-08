import {
  DELIVERY_STATUS,
  DELIVERY_STATUS_LABEL,
  type DeliveryLifecycleStatus,
} from '@/constants/deliveryStatus';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const STEPS: DeliveryLifecycleStatus[] = [
  DELIVERY_STATUS.ACCEPTED,
  DELIVERY_STATUS.ARRIVED_AT_RESTAURANT,
  DELIVERY_STATUS.PICKED_UP,
  DELIVERY_STATUS.ON_THE_WAY,
  DELIVERY_STATUS.ARRIVED_CUSTOMER,
  DELIVERY_STATUS.DELIVERED,
];

export function DeliveryTimeline({ status }: { status: DeliveryLifecycleStatus }) {
  const currentIndex = STEPS.indexOf(status);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Delivery timeline</Text>
      {STEPS.map((step, index) => {
        const done = currentIndex >= index || status === DELIVERY_STATUS.DELIVERED;
        return (
          <View key={step} style={styles.row}>
            <View style={[styles.dot, done && styles.dotDone]} />
            <Text style={[styles.label, done && styles.labelDone]}>{DELIVERY_STATUS_LABEL[step]}</Text>
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
    borderColor: '#334155',
    backgroundColor: '#111827',
    padding: 14,
  },
  title: { color: '#F8FAFC', fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#334155',
    marginRight: 10,
  },
  dotDone: { backgroundColor: '#22C55E' },
  label: { color: '#94A3B8', fontWeight: '600' },
  labelDone: { color: '#F8FAFC', fontWeight: '800' },
});
