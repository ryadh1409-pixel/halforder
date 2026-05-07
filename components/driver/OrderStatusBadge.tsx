import { formatOrderStatus } from './driverOrderUtils';
import type { OrderStatus } from '@/services/orderService';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.dot}>●</Text>
      <Text style={styles.text}>{formatOrderStatus(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dot: { color: '#2563EB', fontSize: 10 },
  text: { color: '#1D4ED8', fontWeight: '800', fontSize: 12 },
});
