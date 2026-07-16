import type { MerchantOrderStatus } from '@/components/orders/statusFlow';
import { getOrderStepIndex } from '@/components/orders/statusFlow';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const STEPS: Array<{ key: MerchantOrderStatus; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'delivered', label: 'Delivered' },
];

export default function OrderTimeline({ status }: { status: MerchantOrderStatus }) {
  const activeIdx = getOrderStepIndex(status);
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
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10, backgroundColor: '#7D8493' },
  dotOn: { backgroundColor: '#22C55E' },
  label: { color: '#7D8493', fontWeight: '600' },
  labelOn: { color: '#FFFFFF', fontWeight: '800' },
});
