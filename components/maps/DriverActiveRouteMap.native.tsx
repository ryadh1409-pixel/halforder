import type { ActiveDelivery, DeliveryLocation } from '@/services/delivery';
import { LiveDriverVehicleMarker } from '@/components/maps/LiveDriverVehicleMarker';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
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

  const liveRoute = useLiveDeliveryRoute({
    restaurant: restaurantCoord,
    driver: driverCoord,
    customer: customerCoord,
    enabled: Boolean(driverCoord && (restaurantCoord || customerCoord)),
    deliveryStatus: order?.firestoreDeliveryStatus || order?.marketplaceCourierStatus,
    kitchenStatus: order?.status,
  });

  const destinationCoord =
    routeLeg === 'to_customer' ? customerCoord : restaurantCoord;

  const routePoints = useMemo(() => {
    if (liveRoute.coordinates.length >= 2) {
      return liveRoute.coordinates;
    }
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
  }, [liveRoute.coordinates, driverCoord, destinationCoord, points]);

  /**
   * Fit Driver + Restaurant + Customer whenever available so the whole trip
   * is visible (Uber Eats–style), not only the active leg.
   */
  const fitPoints = useMemo(() => {
    const list: MapLatLng[] = [];
    const pushUnique = (c: MapLatLng | null | undefined) => {
      if (!c) return;
      if (
        list.some(
          (p) =>
            Math.abs(p.latitude - c.latitude) < 1e-6 &&
            Math.abs(p.longitude - c.longitude) < 1e-6,
        )
      ) {
        return;
      }
      list.push(c);
    };
    pushUnique(driverCoord);
    pushUnique(restaurantCoord);
    pushUnique(customerCoord);
    if (list.length >= 1) return list;
    if (routePoints.length > 0) return routePoints;
    return list;
  }, [driverCoord, restaurantCoord, customerCoord, routePoints]);

  const missingStops = !restaurantCoord || !customerCoord;

  /** `overview` = one-shot fit of trip markers; `follow` = track the car only. */
  const cameraPhaseRef = useRef<'overview' | 'follow'>('overview');
  const lastFollowCoordRef = useRef<MapLatLng | null>(null);

  // Destination switch (pickup → delivery): one overview fit, then follow again.
  useEffect(() => {
    setFollowDriver(true);
    cameraPhaseRef.current = 'overview';
    lastFollowCoordRef.current = null;
  }, [routeLeg]);

  useEffect(() => {
    const map = (mapRef?.current as MapView | null) ?? localMapRef.current;
    if (!mapReady || !map || !followDriver) return;

    try {
      if (cameraPhaseRef.current === 'overview') {
        // Wait until at least two trip points exist (e.g. Driver+Restaurant, or R+C).
        if (fitPoints.length < 2) return;

        fitMapToCoordinates(map as never, fitPoints, {
          top: 56,
          right: 48,
          bottom: 56,
          left: 48,
        });
        cameraPhaseRef.current = 'follow';
        if (driverCoord) lastFollowCoordRef.current = driverCoord;
        return;
      }

      // Follow mode — center on the vehicle only; never refit all markers.
      if (!driverCoord) return;
      const prev = lastFollowCoordRef.current;
      if (prev) {
        const movedKm = haversineDistanceKm(
          prev.latitude,
          prev.longitude,
          driverCoord.latitude,
          driverCoord.longitude,
        );
        // Ignore tiny GPS jitter so the camera doesn't jump.
        if (movedKm < 0.012) return;
      }
      lastFollowCoordRef.current = driverCoord;
      map.animateToRegion(
        {
          latitude: driverCoord.latitude,
          longitude: driverCoord.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        700,
      );
    } catch {
      /* map not ready */
    }
  }, [
    mapReady,
    followDriver,
    fitPoints,
    driverCoord,
    restaurantCoord,
    customerCoord,
    routeLeg,
    mapRef,
  ]);

  const setMapRef = (instance: MapView | null) => {
    localMapRef.current = instance;
    if (mapRef && typeof mapRef === 'object' && 'current' in mapRef) {
      (mapRef as React.MutableRefObject<unknown>).current = instance;
    }
  };

  const hasAnyCoord = Boolean(
    driverCoord || restaurantCoord || customerCoord || routePoints.length > 0,
  );

  if (!hasAnyCoord) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          Loading delivery map…{'\n'}Waiting for restaurant and customer locations.
        </Text>
      </View>
    );
  }

  const initial =
    fitPoints[0] ??
    routePoints[0] ??
    restaurantCoord ??
    customerCoord ??
    driverCoord ??
    null;

  if (
    !initial ||
    !Number.isFinite(initial.latitude) ||
    !Number.isFinite(initial.longitude)
  ) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          Loading delivery map…{'\n'}Waiting for restaurant and customer locations.
        </Text>
      </View>
    );
  }

  const showWaitingBanner =
    awaitingFirstFix || waitingForLiveUpdate || missingStops;

  const waitingMessage = missingStops
    ? !restaurantCoord && !customerCoord
      ? 'Waiting for restaurant and customer locations…'
      : !restaurantCoord
        ? 'Waiting for restaurant location…'
        : 'Waiting for customer location…'
    : 'Waiting for driver location…';

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
          <Text style={styles.waitingText}>{waitingMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: 280, borderRadius: 12, overflow: 'hidden' },
  map: { width: '100%', height: 280 },
  fallback: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fallbackText: {
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
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
