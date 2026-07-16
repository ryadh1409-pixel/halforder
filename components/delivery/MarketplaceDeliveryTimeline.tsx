import {
  MARKETPLACE_DELIVERY_STATUS,
  marketplaceDeliveryStatusLabel,
  type MarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const STEPS: MarketplaceDeliveryStatus[] = [
  MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
  MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
  MARKETPLACE_DELIVERY_STATUS.DELIVERED,
];

function stepIndex(status: MarketplaceDeliveryStatus): number {
  const idx = STEPS.indexOf(status);
  if (idx >= 0) return idx;
  if (status === MARKETPLACE_DELIVERY_STATUS.PENDING) return -1;
  if (status === MARKETPLACE_DELIVERY_STATUS.ACCEPTED) return 0;
  if (status === MARKETPLACE_DELIVERY_STATUS.PREPARING) return 0;
  return 0;
}

export function MarketplaceDeliveryTimeline({
  status,
}: {
  status: MarketplaceDeliveryStatus;
}) {
  const currentIndex = stepIndex(status);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Delivery timeline</Text>
      {STEPS.map((step, index) => {
        const done =
          currentIndex >= index || status === MARKETPLACE_DELIVERY_STATUS.DELIVERED;
        return (
          <View key={step} style={styles.row}>
            <View style={[styles.dot, done && styles.dotDone]} />
            <Text style={[styles.label, done && styles.labelDone]}>
              {marketplaceDeliveryStatusLabel(step)}
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
    borderColor: '#334155',
    backgroundColor: '#171923',
    padding: 14,
  },
  title: { color: '#FFFFFF', fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#334155',
    marginRight: 10,
  },
  dotDone: { backgroundColor: '#22C55E' },
  label: { color: '#7D8493', fontWeight: '600' },
  labelDone: { color: '#FFFFFF', fontWeight: '800' },
});
