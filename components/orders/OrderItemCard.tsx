import type { OrderItem } from '@/services/orderService';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export default function OrderItemCard({ item }: { item: OrderItem }) {
  return (
    <View style={styles.row}>
      {item.image ? <Image source={{ uri: item.image }} style={styles.img} /> : <View style={styles.ph} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>Qty {item.qty}</Text>
      </View>
      <Text style={styles.price}>${(item.price * item.qty).toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 10,
    marginBottom: 8,
  },
  img: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  ph: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  name: { color: '#FFFFFF', fontWeight: '800' },
  meta: { color: '#7D8493', marginTop: 2, fontWeight: '600' },
  price: { color: '#FFFFFF', fontWeight: '800' },
});
