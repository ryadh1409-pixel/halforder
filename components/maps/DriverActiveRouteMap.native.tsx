import type { ActiveDelivery, DeliveryLocation } from '@/services/delivery';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export type DriverActiveRouteMapProps = {
  mapRef: React.RefObject<unknown>;
  order: ActiveDelivery;
  currentLocation: DeliveryLocation | null;
  points: { latitude: number; longitude: number }[];
};

export function DriverActiveRouteMap({
  mapRef,
  order,
  currentLocation,
  points,
}: DriverActiveRouteMapProps) {
  useEffect(() => {
    const m = mapRef.current as MapView | null;
    if (!m || points.length === 0) return;
    m.fitToCoordinates(points, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  }, [mapRef, points]);

  if (points.length === 0) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Waiting for route coordinates…</Text>
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef as React.Ref<MapView>}
      style={styles.map}
      provider={getNativeMapProvider()}
      initialRegion={{
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }}
    >
      {(currentLocation ?? order.driverLocation) ? (
        <Marker
          coordinate={{
            latitude: (currentLocation ?? order.driverLocation)!.lat,
            longitude: (currentLocation ?? order.driverLocation)!.lng,
          }}
          title="Driver"
          pinColor="#22C55E"
        />
      ) : null}
      {order.restaurantLocation ? (
        <Marker
          coordinate={{
            latitude: order.restaurantLocation.lat,
            longitude: order.restaurantLocation.lng,
          }}
          title="Restaurant"
          pinColor="#F59E0B"
        />
      ) : null}
      {order.customerLocation ? (
        <Marker
          coordinate={{
            latitude: order.customerLocation.lat,
            longitude: order.customerLocation.lng,
          }}
          title="Customer"
          pinColor="#2563EB"
        />
      ) : null}
      {points.length >= 2 ? (
        <Polyline coordinates={points} strokeColor="#22C55E" strokeWidth={4} />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 220, borderRadius: 12 },
  fallback: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fallbackText: { color: '#64748b', fontWeight: '600', textAlign: 'center' },
});
