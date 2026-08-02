/**
 * Customer live tracking map — native only (react-native-maps never imported on web).
 * Professional delivery tracking with animated driver, fit-to-all-markers, and route polyline.
 */
import { TrackingMapFallbackCard } from '@/components/maps/TrackingMapFallback';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
import {
  collectMapCoordinates,
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

// Lazy-load react-native-maps to avoid crash in old dev clients
let MapView: any = null;
let AnimatedRegion: any = null;
let Marker: any = null;
let MarkerAnimated: any = null;
let Polyline: any = null;
try {
  const rnm = require('react-native-maps');
  MapView = rnm.default ?? rnm.MapView ?? rnm;
  AnimatedRegion = rnm.AnimatedRegion;
  Marker = rnm.Marker;
  MarkerAnimated = rnm.MarkerAnimated;
  Polyline = rnm.Polyline;
} catch (e: any) {
  console.error('[CustomerTrackingMap] react-native-maps failed to load:', e?.message ?? e);
}

type LatLng = { latitude: number; longitude: number };

// ── Compute a region that fits ALL markers ────────────────────────────────────
function computeFitRegion(points: LatLng[]) {
  if (!points.length) return null;
  if (points.length === 1) {
    return {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    };
  }
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPad = Math.max((maxLat - minLat) * 0.45, 0.01);
  const lngPad = Math.max((maxLng - minLng) * 0.45, 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: maxLat - minLat + latPad,
    longitudeDelta: maxLng - minLng + lngPad,
  };
}

// ── Error boundary ────────────────────────────────────────────────────────────
class MapErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ── Marker designs ────────────────────────────────────────────────────────────
function PinMarker({ emoji, label, color }: { emoji: string; label: string; color: string }) {
  return (
    <View style={styles.pinOuter}>
      <View style={[styles.pinBubble, { backgroundColor: color }]}>
        <Text style={styles.pinEmoji}>{emoji}</Text>
      </View>
      <View style={[styles.pinTip, { borderTopColor: color }]} />
      <View style={[styles.pinLabel, { backgroundColor: color }]}>
        <Text style={styles.pinLabelText}>{label}</Text>
      </View>
    </View>
  );
}

function DriverMarker({ heading }: { heading: number | null }) {
  return (
    <View style={styles.driverOuter}>
      <View style={styles.driverRing}>
        <View style={styles.driverBubble}>
          <Text style={styles.driverEmoji}>🚗</Text>
        </View>
      </View>
    </View>
  );
}

// ── Edge padding used everywhere ──────────────────────────────────────────────
const FIT_PADDING = { top: 120, right: 48, bottom: 80, left: 48 };

// ── Inner map component ───────────────────────────────────────────────────────
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
  const driverAnimRef = useRef<any>(null);
  const lastDriverRef = useRef<LatLng | null>(null);
  const seededRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [followAll, setFollowAll] = useState(true);

  // All known marker coordinates
  const markerPoints = useMemo(
    () => collectMapCoordinates(restaurant, dropoff, driver),
    [restaurant, dropoff, driver],
  );

  // Points to fit the viewport to (route takes priority if present)
  const fitPoints = useMemo(() => {
    if (routeCoordinates.length >= 2) {
      // Include route + all markers so nothing is clipped
      return collectMapCoordinates(...routeCoordinates, ...markerPoints);
    }
    return markerPoints;
  }, [routeCoordinates, markerPoints]);

  // Initial region fits ALL markers, not just the first one
  const initialRegion = useMemo(() => computeFitRegion(markerPoints), [markerPoints]);

  const seedPoint = driver ?? markerPoints[0] ?? null;

  // Seed AnimatedRegion for smooth driver animation
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

  // Smooth driver position animation
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
      ? haversineDistanceKm(prev.latitude, prev.longitude, driver.latitude, driver.longitude)
      : 0;
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

  // Auto-fit map after ready and whenever route/markers change
  useEffect(() => {
    if (!mapReady || !followAll || fitPoints.length < 1) return;
    const pts = fitPoints.length > 0 ? fitPoints : markerPoints;
    const t = setTimeout(() => {
      if (pts.length === 1) {
        // Single point — animate to it at street level
        mapRef.current?.animateToRegion(
          { ...pts[0], latitudeDelta: 0.018, longitudeDelta: 0.018 },
          500,
        );
      } else {
        fitMapToCoordinates(mapRef.current, pts, FIT_PADDING);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [mapReady, followAll, fitPoints, markerPoints]);

  const recenter = useCallback(() => {
    setFollowAll(true);
    const pts = fitPoints.length > 0 ? fitPoints : markerPoints;
    if (pts.length === 1) {
      mapRef.current?.animateToRegion(
        { ...pts[0], latitudeDelta: 0.018, longitudeDelta: 0.018 },
        400,
      );
    } else {
      fitMapToCoordinates(mapRef.current, pts, FIT_PADDING);
    }
  }, [fitPoints, markerPoints]);

  if (!MapView) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#A855F7" />
      </View>
    );
  }

  if (!initialRegion) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#A855F7" />
        <Text style={styles.loadingText}>Waiting for location…</Text>
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
        showsCompass={false}
        showsScale={false}
        showsUserLocation={false}
        rotateEnabled={false}
        pitchEnabled={false}
        zoomEnabled
        zoomTapEnabled
        scrollEnabled
        toolbarEnabled={false}
        onMapReady={() => setMapReady(true)}
        onPanDrag={() => setFollowAll(false)}
      >
        {/* Restaurant pin */}
        {restaurant ? (
          <Marker
            coordinate={restaurant}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={2}
          >
            <PinMarker emoji="🍔" label="Restaurant" color="#F59E0B" />
          </Marker>
        ) : null}

        {/* Customer / dropoff pin */}
        {dropoff ? (
          <Marker
            coordinate={dropoff}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={2}
          >
            <PinMarker emoji="🏠" label="Your home" color="#22C55E" />
          </Marker>
        ) : null}

        {/* Driver pin — animated when AnimatedRegion is available */}
        {driver && anim && MarkerAnimated ? (
          <MarkerAnimated
            coordinate={anim as never}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={typeof driverHeading === 'number' ? driverHeading : 0}
            tracksViewChanges={false}
            zIndex={3}
          >
            <DriverMarker heading={driverHeading} />
          </MarkerAnimated>
        ) : driver ? (
          <Marker
            coordinate={driver}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={typeof driverHeading === 'number' ? driverHeading : 0}
            tracksViewChanges={false}
            zIndex={3}
          >
            <DriverMarker heading={driverHeading} />
          </Marker>
        ) : null}

        {/* Route polyline */}
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

      {/* Recenter button */}
      <Pressable
        style={[styles.recenterBtn, !followAll && styles.recenterBtnActive]}
        onPress={recenter}
        accessibilityLabel="Fit map to all markers"
      >
        <Ionicons
          name="scan-outline"
          size={20}
          color="#FFFFFF"
        />
      </Pressable>
    </View>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export type CustomerTrackingMapProps = {
  order: RestaurantOrder;
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

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  mapWrap: { flex: 1, width: '100%', minHeight: 200 },
  mapView: { flex: 1, width: '100%', minHeight: 200 },

  loadingWrap: {
    flex: 1,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
  },
  loadingText: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },

  // ── Pin marker ──────────────────────────────────────────────────────────────
  pinOuter: {
    alignItems: 'center',
  },
  pinBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  pinEmoji: {
    fontSize: 22,
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  pinLabel: {
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pinLabelText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── Driver marker ───────────────────────────────────────────────────────────
  driverOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(168,85,247,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#A855F7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A855F7',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  driverEmoji: { fontSize: 22 },

  // ── Recenter button ─────────────────────────────────────────────────────────
  recenterBtn: {
    position: 'absolute',
    right: 14,
    bottom: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  recenterBtnActive: {
    backgroundColor: '#A855F7',
  },
});
