import type { ActiveDelivery, DeliveryLocation } from '@/services/delivery';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type DriverActiveRouteMapProps = {
  mapRef: React.RefObject<unknown>;
  order: ActiveDelivery;
  currentLocation: DeliveryLocation | null;
  points: { latitude: number; longitude: number }[];
};

export function DriverActiveRouteMap({
  order,
  points,
}: DriverActiveRouteMapProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Live route</Text>
      <Text style={styles.meta}>
        {points.length > 0
          ? `${points.length} waypoints · open Maps on your phone for navigation`
          : 'Waiting for coordinates…'}
      </Text>
      {order.deliveryAddress ? (
        <Text style={styles.addr} numberOfLines={3}>
          {order.deliveryAddress}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    minHeight: 200,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    padding: 16,
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  meta: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  addr: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
});
