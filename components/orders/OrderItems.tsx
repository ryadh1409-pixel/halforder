import OrderItemCard from '@/components/orders/OrderItemCard';
import type { OrderItem } from '@/services/orderService';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function OrderItems({
  items,
  itemCount,
}: {
  items: OrderItem[];
  itemCount: number;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.section}>Items ({itemCount})</Text>
      {items.map((item) => (
        <OrderItemCard key={`${item.id}-${item.name}`} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  section: { color: '#0F172A', fontWeight: '800', fontSize: 16, marginBottom: 8 },
});
