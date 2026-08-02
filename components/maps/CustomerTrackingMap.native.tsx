/**
 * Customer live tracking map — native only (`react-native-maps` never imported on web).
 */
import { TrackingMapFallbackCard } from '@/components/maps/TrackingMapFallback';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
import {
  collectMapCoordinates,
  regionFromCoordinates,
  toMapCoordinate,
} from '@/lib/location/coordinates';
import { fitMapToCoordinates } from '@/lib/maps/fitMapRegion';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import { haversineDistanceKm } from '@/lib/haversine';
import type { RestaurantOrder } from '@/services/orderService';
import { Ionicons } from '@expo/vector-icons';
import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// Lazy-load react-native-maps so the module doesn't crash in dev clients
// that were built before the native module was added.
let MapView: any = null;
let AnimatedRegion: any = null;
let Marker: any = null;
let MarkerAnimated: any = null;
let Polyline: any = null;
try {
  const rnm = require('react-native-maps');
  MapView = rnm.default;
  AnimatedRegion = rnm.AnimatedRegion;
  Marker = rnm.Marker;
  MarkerAnimated = rnm.MarkerAnimated;
  Polyline = rnm.Polyline;
} catch {
  // Native module not available in this build (dev client)
}

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

function MarkerPin({ emoji, accent }: { emoji: string; accent: string }) {
  return (
    <View style={[styles.markerBubble, { borderColor: accent }]}>
      <Text style={styles.markerEmoji}>{emoji}</Text>
    </View>
  );
}

function TrackingMapInner({
  restaurant,
  dropoff,
  driver,
  driverHeading,
  routeCoordinates,
}: {
  restaurant: LatLng | null;
  dropoff: LatLng | null;
  driver: LatLng | null;
  driverHeading: number | null;
  routeCoordinates: LatLng[];
}) {
  const mapRef = useRef<any>(null);
  const driverAnimRef = useRef<AnimatedRegion | null>(null);
  const lastDriverRef = useRef<LatLng | null>(null);
  const seededRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [followDriver, setFollowDriver] = useState(true);

  const markerPoints = useMemo(
    () => collectMapCoordinates(restaurant, dropoff, driver),
    [restaurant, dropoff, driver],
  );
  const fitPoints = useMemo(() => {
    if (routeCoordinates.length >= 2) {
      return collectMapCoordinates(...routeCoordinates, ...markerPoints);
    }
    return markerPoints;
  }, [routeCoordinates, markerPoints]);
  const initialRegion = useMemo(() => regionFromCoordinates(markerPoints), [markerPoints]);
  const seedPoint = driver ?? markerPoints[0] ?? null;

  useEffect(() => {
    if (!seedPoint || !AnimatedRegion) return;
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
      lastDriverRef.current = driver;
      seededRef.current = true;
      return;
    }

    const prev = lastDriverRef.current;
    const movedKm = prev
      ? haversineDistanceKm(
          prev.latitude,
          prev.longitude,
          driver.latitude,
          driver.longitude,
        )
      : 0;
    // Scale duration with distance so GPS updates never "jump".
    const duration = Math.min(2200, Math.max(700, Math.round(movedKm * 12000)));
    lastDriverRef.current = driver;
    anim
      .timing({
        latitude: driver.latitude,
        longitude: driver.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration,
        useNativeDriver: false,
      } as never)
      .start();
  }, [driver?.latitude, driver?.longitude]);

  const recenter = useCallback(() => {
    setFollowDriver(true);
    fitMapToCoordinates(mapRef.current, fitPoints.length ? fitPoints : markerPoints, {
      top: 100,
      right: 36,
      bottom: 56,
      left: 36,
    });
  }, [fitPoints, markerPoints]);

  useEffect(() => {
    if (!mapReady || !followDriver || fitPoints.length < 1) return;
    const t = setTimeout(() => {
      fitMapToCoordinates(mapRef.current, fitPoints, {
        top: 100,
        right: 36,
        bottom: 56,
        left: 36,
      });
    }, 420);
    return () => clearTimeout(t);
  }, [mapReady, followDriver, fitPoints]);

  if (!MapView) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Map unavailable in this build</Text>
      </View>
    );
  }

  if (!initialRegion) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#A855F7" />
        <Text style={styles.loadingText}>Waiting for location data…</Text>
      </View>
    );
  }

  const anim = driverAnimRef.current;
  const mapProvider = getNativeMapProvider();

  return (
    <View style={styles.mapWrap}>
      <MapView
        ref={mapRef}
        style={styles.mapView}
        provider={mapProvider}
        initialRegion={initialRegion}
        userInterfaceStyle="light"
        showsCompass
        showsScale={false}
        rotateEnabled
        pitchEnabled
        zoomEnabled
        zoomTapEnabled
        scrollEnabled
        toolbarEnabled={false}
        onMapReady={() => setMapReady(true)}
        onPanDrag={() => setFollowDriver(false)}
      >
        {restaurant ? (
          <Marker
            coordinate={restaurant}
            title="Restaurant"
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
          >
            <MarkerPin emoji="🍔" accent="#F59E0B" />
          </Marker>
        ) : null}
        {dropoff ? (
          <Marker
            coordinate={dropoff}
            title="Customer"
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
          >
            <MarkerPin emoji="🏠" accent="#22C55E" />
          </Marker>
        ) : null}
        {driver && anim && MarkerAnimated ? (
          <MarkerAnimated
            coordinate={anim as never}
            title="Driver"
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={typeof driverHeading === 'number' ? driverHeading : 0}
          >
            <View style={styles.driverMarker}>
              <Text style={styles.driverEmoji}>🚗</Text>
            </View>
          </MarkerAnimated>
        ) : driver ? (
          <Marker
            coordinate={driver}
            title="Driver"
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={typeof driverHeading === 'number' ? driverHeading : 0}
          >
            <View style={styles.driverMarker}>
              <Text style={styles.driverEmoji}>🚗</Text>
            </View>
          </Marker>
        ) : null}
        {routeCoordinates.length >= 2 ? (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#A855F7"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
      </MapView>

      <Pressable
        style={styles.recenterBtn}
        onPress={recenter}
        accessibilityLabel="Recenter map"
      >
        <Ionicons
          name={followDriver ? 'navigate' : 'navigate-outline'}
          size={20}
          color="#FFFFFF"
        />
      </Pressable>
    </View>
  );
}

export type CustomerTrackingMapProps = {
  order: RestaurantOrder;
  /** Optional externally computed route (preferred when parent owns ETA). */
  routeCoordinates?: LatLng[];
};

export function CustomerTrackingMap({
  order,
  routeCoordinates: routeCoordinatesProp,
}: CustomerTrackingMapProps) {
  const restaurant = toMapCoordinate(order.restaurantLocation);
  const dropoff =
    toMapCoordinate(order.customerLocation) ??
    toMapCoordinate(order.deliveryLocation) ??
    toMapCoordinate(order.userLocation);
  const driver = order.driverLocation ? toMapCoordinate(order.driverLocation) : null;
  const driverHeading =
    typeof order.driverLocation?.heading === 'number' &&
    Number.isFinite(order.driverLocation.heading)
      ? order.driverLocation.heading
      : null;

  const internalRoute = useLiveDeliveryRoute({
    restaurant,
    driver,
    customer: dropoff,
    enabled: routeCoordinatesProp == null,
  });

  const routeCoordinates =
    routeCoordinatesProp != null ? routeCoordinatesProp : internalRoute.coordinates;

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
        driverHeading={driverHeading}
        routeCoordinates={routeCoordinates}
      />
    </MapErrorBoundary>
  );
}

const styles = StyleSheet.create({
  mapWrap: { flex: 1, width: '100%', minHeight: 200 },
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
    backgroundColor: '#0B0816',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
  },
  markerEmoji: { fontSize: 18 },
  driverMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0B0816',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#A855F7',
  },
  driverEmoji: { fontSize: 22 },
  recenterBtn: {
    position: 'absolute',
    right: 12,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0B0816',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
