import type { ActiveDelivery, DeliveryLocation } from '@/services/delivery';
import { deliveryMapLegFromStatuses } from '@/lib/maps/deliveryRouteStage';
import { fitMapToCoordinates } from '@/lib/maps/fitMapRegion';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import { parseLegacyLatLng } from '@/lib/location/coordinates';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

type LatLng = { latitude: number; longitude: number };

export type DriverActiveRouteMapProps = {
  mapRef: React.RefObject<unknown>;
  order: ActiveDelivery;
  currentLocation: DeliveryLocation | null;
  points: { latitude: number; longitude: number }[];
};

function toLatLng(value: unknown): LatLng | null {
  try {
    const parsed = parseLegacyLatLng(value);
    if (!parsed) return null;
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
    return { latitude: parsed.lat, longitude: parsed.lng };
  } catch {
    return null;
  }
}

export function DriverActiveRouteMap({
  mapRef,
  order,
  currentLocation,
  points,
}: DriverActiveRouteMapProps) {
  const localMapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const routeLeg = useMemo(() => {
    if (!order) return 'to_restaurant' as const;
    return deliveryMapLegFromStatuses(
      order.marketplaceCourierStatus ?? order.firestoreDeliveryStatus,
      order.status,
    );
  }, [
    order?.marketplaceCourierStatus,
    order?.firestoreDeliveryStatus,
    order?.status,
  ]);

  const driverCoord = useMemo(() => {
    const live = currentLocation ?? order?.driverLocation ?? null;
    return toLatLng(live);
  }, [currentLocation, order?.driverLocation]);

  const restaurantCoord = useMemo(
    () => toLatLng(order?.restaurantLocation ?? null),
    [order?.restaurantLocation],
  );

  const customerCoord = useMemo(
    () => toLatLng(order?.customerLocation ?? null),
    [order?.customerLocation],
  );

  const destinationCoord =
    routeLeg === 'to_customer' ? customerCoord : restaurantCoord;

  const routePoints = useMemo(() => {
    const list: LatLng[] = [];
    if (driverCoord) list.push(driverCoord);
    if (destinationCoord) list.push(destinationCoord);
    if (list.length >= 2) return list;
    return (points ?? []).filter(
      (p) =>
        p != null &&
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude),
    );
  }, [driverCoord, destinationCoord, points]);

  const fitPoints = useMemo(() => {
    if (driverCoord && destinationCoord) return [driverCoord, destinationCoord];
    if (routePoints.length > 0) return routePoints;
    return driverCoord ? [driverCoord] : [];
  }, [driverCoord, destinationCoord, routePoints]);

  useEffect(() => {
    const map = (mapRef?.current as MapView | null) ?? localMapRef.current;
    if (!mapReady || !map || fitPoints.length === 0) return;
    try {
      if (fitPoints.length >= 2) {
        fitMapToCoordinates(map, fitPoints, {
          top: 48,
          right: 48,
          bottom: 48,
          left: 48,
        });
        return;
      }
      if (driverCoord) {
        map.animateToRegion(
          {
            latitude: driverCoord.latitude,
            longitude: driverCoord.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          450,
        );
      }
    } catch {
      /* map not ready */
    }
  }, [mapReady, fitPoints, driverCoord, mapRef]);

  const setMapRef = (instance: MapView | null) => {
    localMapRef.current = instance;
    if (mapRef && typeof mapRef === 'object' && 'current' in mapRef) {
      (mapRef as React.MutableRefObject<unknown>).current = instance;
    }
  };

  if (fitPoints.length === 0 && routePoints.length === 0) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Waiting for live GPS…</Text>
      </View>
    );
  }

  const initial = fitPoints[0] ?? routePoints[0];
  if (
    !initial ||
    !Number.isFinite(initial.latitude) ||
    !Number.isFinite(initial.longitude)
  ) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Waiting for live GPS…</Text>
      </View>
    );
  }

  return (
    <MapView
      ref={setMapRef}
      style={styles.map}
      provider={getNativeMapProvider()}
      initialRegion={{
        latitude: initial.latitude,
        longitude: initial.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }}
      onMapReady={() => setMapReady(true)}
      showsUserLocation={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      {driverCoord ? (
        <Marker coordinate={driverCoord} title="You" pinColor="#22C55E" />
      ) : null}

      {routeLeg === 'to_restaurant' && restaurantCoord ? (
        <Marker
          coordinate={restaurantCoord}
          title="Restaurant"
          description="Pickup"
          pinColor="#F59E0B"
        />
      ) : null}

      {routeLeg === 'to_customer' && customerCoord ? (
        <Marker
          coordinate={customerCoord}
          title="Customer"
          description="Dropoff"
          pinColor="#2563EB"
        />
      ) : null}

      {routePoints.length >= 2 ? (
        <Polyline coordinates={routePoints} strokeColor="#22C55E" strokeWidth={4} />
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
