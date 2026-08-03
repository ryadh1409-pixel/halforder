import type { ActiveDelivery, DeliveryLocation } from '@/services/delivery';
import { LiveDriverVehicleMarker } from '@/components/maps/LiveDriverVehicleMarker';
import { useLiveDriverMarker } from '@/hooks/useLiveDriverMarker';
import { parseLegacyLatLng } from '@/lib/location/coordinates';
import { deliveryMapLegFromStatuses } from '@/lib/maps/deliveryRouteStage';
import { fitMapToCoordinates } from '@/lib/maps/fitMapRegion';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import { haversineDistanceKm } from '@/lib/haversine';
import { validMapCoord, type MapLatLng } from '@/lib/maps/liveDriverMarker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export type DriverActiveRouteMapProps = {
  mapRef: React.RefObject<unknown>;
  order: ActiveDelivery;
  currentLocation: DeliveryLocation | null;
  points: { latitude: number; longitude: number }[];
};

function toLatLng(value: unknown): MapLatLng | null {
  try {
    const parsed = parseLegacyLatLng(value);
    if (!parsed) return null;
    return validMapCoord({ latitude: parsed.lat, longitude: parsed.lng });
  } catch {
    return null;
  }
}

function extractLiveInput(
  currentLocation: DeliveryLocation | null,
  orderDriverLocation: ActiveDelivery['driverLocation'],
): {
  latitude: number;
  longitude: number;
  heading?: number | null;
} | null {
  const live = currentLocation ?? orderDriverLocation ?? null;
  if (!live) return null;
  const coord = toLatLng(live);
  if (!coord) return null;
  const heading =
    typeof (live as { heading?: unknown }).heading === 'number'
      ? (live as { heading: number }).heading
      : null;
  return {
    latitude: coord.latitude,
    longitude: coord.longitude,
    heading,
  };
}

export function DriverActiveRouteMap({
  mapRef,
  order,
  currentLocation,
  points,
}: DriverActiveRouteMapProps) {
  const localMapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [followDriver, setFollowDriver] = useState(true);
  const lastFitDriverRef = useRef<MapLatLng | null>(null);

  const routeLeg = useMemo(() => {
    if (!order) return 'to_restaurant' as const;
    return deliveryMapLegFromStatuses(
      order.firestoreDeliveryStatus || order.marketplaceCourierStatus,
      order.status,
    );
  }, [
    order?.marketplaceCourierStatus,
    order?.firestoreDeliveryStatus,
    order?.status,
  ]);

  const liveInput = useMemo(
    () => extractLiveInput(currentLocation, order?.driverLocation ?? null),
    [
      currentLocation?.lat,
      currentLocation?.lng,
      currentLocation?.heading,
      order?.driverLocation?.lat,
      order?.driverLocation?.lng,
      order?.driverLocation?.heading,
    ],
  );

  const {
    coordinate: driverCoord,
    heading: driverHeading,
    awaitingFirstFix,
    waitingForLiveUpdate,
    animatedCoordinate,
  } = useLiveDriverMarker(liveInput);

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
    const list: MapLatLng[] = [];
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

  /** Fit driver + active destination; keep both fixed pins when available. */
  const fitPoints = useMemo(() => {
    const list: MapLatLng[] = [];
    if (driverCoord) list.push(driverCoord);
    if (destinationCoord) list.push(destinationCoord);
    if (restaurantCoord && routeLeg === 'to_customer') {
      // After pickup still keep restaurant context loosely — prefer destination.
    }
    if (list.length >= 1) return list;
    if (restaurantCoord) list.push(restaurantCoord);
    if (customerCoord) list.push(customerCoord);
    if (routePoints.length > 0) return routePoints;
    return list;
  }, [
    driverCoord,
    destinationCoord,
    restaurantCoord,
    customerCoord,
    routePoints,
    routeLeg,
  ]);

  useEffect(() => {
    const map = (mapRef?.current as MapView | null) ?? localMapRef.current;
    if (!mapReady || !map || fitPoints.length === 0 || !followDriver) return;

    const firstFit = !lastFitDriverRef.current;
    const movedFar =
      !!driverCoord &&
      !!lastFitDriverRef.current &&
      haversineDistanceKm(
        lastFitDriverRef.current.latitude,
        lastFitDriverRef.current.longitude,
        driverCoord.latitude,
        driverCoord.longitude,
      ) > 0.08;

    if (!firstFit && !movedFar) return;

    try {
      if (fitPoints.length >= 2) {
        fitMapToCoordinates(map as never, fitPoints, {
          top: 48,
          right: 48,
          bottom: 48,
          left: 48,
        });
      } else if (driverCoord) {
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
      if (driverCoord) lastFitDriverRef.current = driverCoord;
    } catch {
      /* map not ready */
    }
  }, [
    mapReady,
    fitPoints,
    driverCoord,
    destinationCoord,
    followDriver,
    routeLeg,
    mapRef,
  ]);

  // Re-fit when the destination leg switches (pickup → dropoff).
  useEffect(() => {
    setFollowDriver(true);
    lastFitDriverRef.current = null;
  }, [routeLeg]);

  const setMapRef = (instance: MapView | null) => {
    localMapRef.current = instance;
    if (mapRef && typeof mapRef === 'object' && 'current' in mapRef) {
      (mapRef as React.MutableRefObject<unknown>).current = instance;
    }
  };

  const hasStaticPins = Boolean(restaurantCoord || customerCoord);
  const showWaitingBanner = awaitingFirstFix || waitingForLiveUpdate;

  if (!driverCoord && !hasStaticPins && routePoints.length === 0) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Waiting for driver location…</Text>
      </View>
    );
  }

  const initial =
    fitPoints[0] ??
    routePoints[0] ??
    restaurantCoord ??
    customerCoord ??
    null;

  if (
    !initial ||
    !Number.isFinite(initial.latitude) ||
    !Number.isFinite(initial.longitude)
  ) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Waiting for driver location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
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
        onPanDrag={() => setFollowDriver(false)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {restaurantCoord ? (
          <Marker
            coordinate={restaurantCoord}
            title="Restaurant"
            description="Pickup"
            pinColor="#F59E0B"
            zIndex={10}
          />
        ) : null}

        {customerCoord ? (
          <Marker
            coordinate={customerCoord}
            title="Customer"
            description="Dropoff"
            pinColor="#2563EB"
            zIndex={10}
          />
        ) : null}

        {driverCoord ? (
          <LiveDriverVehicleMarker
            coordinate={driverCoord}
            heading={driverHeading}
            title="You"
            animatedCoordinate={animatedCoordinate}
          />
        ) : null}

        {routePoints.length >= 2 ? (
          <Polyline
            coordinates={routePoints}
            strokeColor="#22C55E"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
      </MapView>

      {showWaitingBanner ? (
        <View style={styles.waitingBanner} pointerEvents="none">
          <Text style={styles.waitingText}>Waiting for driver location…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: 220, borderRadius: 12, overflow: 'hidden' },
  map: { width: '100%', height: 220 },
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
  waitingBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  waitingText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
});
