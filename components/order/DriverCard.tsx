import type { RestaurantOrder } from '@/services/orderService';
import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

export function DriverCard({ order }: { order: RestaurantOrder }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Driver</Text>
      <Text style={styles.meta}>{order.driverName?.trim() ? order.driverName : 'Matching a driver...'}</Text>
      {order.driverPhone ? (
        <Text style={styles.link} onPress={() => Linking.openURL(`tel:${order.driverPhone}`)}>
          Call {order.driverPhone}
        </Text>
      ) : (
        <Text style={styles.muted}>Phone unavailable</Text>
      )}
      {order.driverVehicle ? <Text style={styles.meta}>Vehicle: {order.driverVehicle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000000',
    padding: 16,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  meta: { color: '#B7BDC9', fontWeight: '600', marginTop: 4 },
  muted: { color: '#7D8493', marginTop: 4, fontWeight: '600' },
  link: { color: '#2563EB', fontWeight: '800', marginTop: 8 },
});
