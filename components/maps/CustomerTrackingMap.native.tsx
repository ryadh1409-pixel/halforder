/**
 * Customer live tracking map — native only (`react-native-maps` never imported on web).
 */
import { TrackingMapFallbackCard } from '@/components/maps/TrackingMapFallback';
import {
  collectMapCoordinates,
  regionFromCoordinates,
  toMapCoordinate,
} from '@/lib/location/coordinates';
import { deliveryMapLegFromStatuses } from '@/lib/maps/deliveryRouteStage';
import { fitMapToCoordinates } from '@/lib/maps/fitMapRegion';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import type { RestaurantOrder } from '@/services/orderService';
import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, {
  AnimatedRegion,
  Marker,
  MarkerAnimated,
  Polyline,
} from 'react-native-maps';

type LatLng = { latitude: number; longitude: number };

class MapErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function TrackingMapInner({
  restaurant,
  dropoff,
  driver,
  routeLeg,
}: {
  restaurant: LatLng | null;
  dropoff: LatLng | null;
  driver: LatLng | null;
  routeLeg: 'to_restaurant' | 'to_customer';
}) {
  const mapRef = useRef<MapView | null>(null);
  const driverAnimRef = useRef<AnimatedRegion | null>(null);
  const seededRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  const markerPoints = useMemo(
    () => collectMapCoordinates(restaurant, dropoff, driver),
    [restaurant, dropoff, driver],
  );
  const initialRegion = useMemo(() => regionFromCoordinates(markerPoints), [markerPoints]);
  const seedPoint = markerPoints[0] ?? null;

  useEffect(() => {
    if (!seedPoint) return;
    if (!driverAnimRef.current) {
      driverAnimRef.current = new AnimatedRegion({
        latitude: seedPoint.latitude,
        longitude: seedPoint.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      seededRef.current = false;
    }
  }, [seedPoint?.latitude, seedPoint?.longitude]);

  useEffect(() => {
    if (!driver || !driverAnimRef.current) return;
    const anim = driverAnimRef.current;
    if (!seededRef.current) {
      anim.setValue({ ...driver, latitudeDelta: 0, longitudeDelta: 0 });
      seededRef.current = true;
      return;
    }
    anim
      .timing({
        latitude: driver.latitude,
        longitude: driver.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: 850,
        useNativeDriver: false,
      } as never)
      .start();
  }, [driver?.latitude, driver?.longitude]);

  // Uber Eats–style: draw the active leg only (pickup vs delivery).
  const polyline = useMemo(() => {
    const pts: LatLng[] = [];
    if (routeLeg === 'to_customer') {
      if (driver) pts.push(driver);
      if (dropoff) pts.push(dropoff);
    } else if (driver && restaurant) {
      pts.push(driver, restaurant);
    } else if (restaurant && dropoff) {
      pts.push(restaurant, dropoff);
    }
    return pts;
  }, [restaurant, driver, dropoff, routeLeg]);

  useEffect(() => {
    if (!mapReady || markerPoints.length < 1) return;
    const t = setTimeout(() => {
      fitMapToCoordinates(mapRef.current, markerPoints, {
        top: 100,
        right: 36,
        bottom: 40,
        left: 36,
      });
    }, 450);
    return () => clearTimeout(t);
  }, [mapReady, markerPoints]);

  if (!initialRegion) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#FF3008" />
        <Text style={styles.loadingText}>Waiting for location data…</Text>
      </View>
    );
  }

  const anim = driverAnimRef.current;
  const mapProvider = getNativeMapProvider();

  return (
    <MapView
      ref={mapRef}
      style={styles.mapView}
      provider={mapProvider}
      initialRegion={initialRegion}
      userInterfaceStyle="light"
      showsCompass={false}
      toolbarEnabled={false}
      onMapReady={() => setMapReady(true)}
    >
      {restaurant ? (
        <Marker coordinate={restaurant} tracksViewChanges={false} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.markerBubble}>
            <Text style={styles.markerEmoji}>📍</Text>
          </View>
        </Marker>
      ) : null}
      {dropoff ? (
        <Marker coordinate={dropoff} tracksViewChanges={false} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.markerBubble}>
            <Text style={styles.markerEmoji}>🏠</Text>
          </View>
        </Marker>
      ) : null}
      {driver && anim && MarkerAnimated ? (
        <MarkerAnimated coordinate={anim as never} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Text style={styles.driverEmoji}>🚗</Text>
          </View>
        </MarkerAnimated>
      ) : driver ? (
        <Marker coordinate={driver} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Text style={styles.driverEmoji}>🚗</Text>
          </View>
        </Marker>
      ) : null}
      {polyline.length >= 2 ? (
        <Polyline coordinates={polyline} strokeColor="#FF3008" strokeWidth={4} />
      ) : null}
    </MapView>
  );
}

export function CustomerTrackingMap({ order }: { order: RestaurantOrder }) {
  const restaurant = toMapCoordinate(order.restaurantLocation);
  const dropoff =
    toMapCoordinate(order.customerLocation) ??
    toMapCoordinate(order.deliveryLocation) ??
    toMapCoordinate(order.userLocation);
  const driver = order.driverLocation ? toMapCoordinate(order.driverLocation) : null;
  const routeLeg = deliveryMapLegFromStatuses(order.deliveryStatus, order.status);
  const pickupLabel =
    order.restaurant?.address?.trim() || order.restaurant?.name || 'Restaurant';
  const dropoffLabel =
    order.deliveryLocation?.address?.trim() || order.customer?.address || 'Your address';

  return (
    <MapErrorBoundary
      fallback={<TrackingMapFallbackCard pickup={pickupLabel} dropoff={dropoffLabel} />}
    >
      <TrackingMapInner
        key={order.id}
        restaurant={restaurant}
        dropoff={dropoff}
        driver={driver}
        routeLeg={routeLeg}
      />
    </MapErrorBoundary>
  );
}

const styles = StyleSheet.create({
  mapView: { flex: 1, width: '100%', minHeight: 200 },
  loadingWrap: {
    flex: 1,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: { color: '#7D8493', fontSize: 14 },
  markerBubble: {
    backgroundColor: '#000000',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
  },
  markerEmoji: { fontSize: 18 },
  driverMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#A855F7',
  },
  driverEmoji: { fontSize: 22 },
});
