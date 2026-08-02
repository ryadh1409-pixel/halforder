/**
 * Customer live tracking map — native only.
 * Uses native Google Maps pins (no custom React children) to avoid the
 * PROVIDER_GOOGLE / iOS blank-snapshot bug (react-native-maps#3384).
 */
import { TrackingMapFallbackCard } from '@/components/maps/TrackingMapFallback';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
import { collectMapCoordinates, toMapCoordinate } from '@/lib/location/coordinates';
import { fitMapToCoordinates } from '@/lib/maps/fitMapRegion';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import { haversineDistanceKm } from '@/lib/haversine';
import type { RestaurantOrder } from '@/services/orderService';
import { Ionicons } from '@expo/vector-icons';
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

// ── Lazy-load react-native-maps ───────────────────────────────────────────────
let MapView: any = null;
let AnimatedRegion: any = null;
let Marker: any = null;
let MarkerAnimated: any = null;
let Polyline: any = null;
try {
  const rnm = require('react-native-maps');
  MapView        = rnm.default ?? rnm.MapView ?? rnm;
  AnimatedRegion = rnm.AnimatedRegion;
  Marker         = rnm.Marker;
  MarkerAnimated = rnm.MarkerAnimated;
  Polyline       = rnm.Polyline;
} catch (e: any) {
  console.error('[CustomerTrackingMap] react-native-maps failed:', e?.message ?? e);
}

type LatLng = { latitude: number; longitude: number };

// ── Reject null-island (0,0) ──────────────────────────────────────────────────
function validCoord(c: LatLng | null | undefined): LatLng | null {
  if (!c) return null;
  if (Math.abs(c.latitude) < 0.001 && Math.abs(c.longitude) < 0.001) return null;
  return c;
}

// ── Fit region that shows ALL markers ────────────────────────────────────────
function computeFitRegion(points: LatLng[]) {
  if (!points.length) return null;
  if (points.length === 1) {
    return {
      latitude:      points[0].latitude,
      longitude:     points[0].longitude,
      latitudeDelta:  0.02,
      longitudeDelta: 0.02,
    };
  }
  const lats   = points.map((p) => p.latitude);
  const lngs   = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPad = Math.max((maxLat - minLat) * 0.5, 0.012);
  const lngPad = Math.max((maxLng - minLng) * 0.5, 0.012);
  return {
    latitude:       (minLat + maxLat) / 2,
    longitude:      (minLng + maxLng) / 2,
    latitudeDelta:  maxLat - minLat + latPad,
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

const FIT_PAD = { top: 130, right: 50, bottom: 80, left: 50 };

// Pin colours — native Google Maps pins (no custom React children)
const PIN_RESTAURANT = '#F59E0B'; // amber
const PIN_HOME       = '#22C55E'; // green
const PIN_DRIVER     = '#7C3AED'; // purple

// ── Inner map ─────────────────────────────────────────────────────────────────
function TrackingMapInner({
  restaurant,
  dropoff,
  driver,
  driverHeading,
  routeCoordinates,
}: {
  restaurant:       LatLng | null;
  dropoff:          LatLng | null;
  driver:           LatLng | null;
  driverHeading:    number | null;
  routeCoordinates: LatLng[];
}) {
  const mapRef    = useRef<any>(null);
  const animRef   = useRef<any>(null);
  const lastDriverRef = useRef<LatLng | null>(null);
  const seededRef = useRef(false);
  const [mapReady,  setMapReady]  = useState(false);
  const [tracking,  setTracking]  = useState(true);

  // ── Marker definitions (native pins — no custom children) ──────────────────
  const markers = useMemo(() => {
    const list: { id: string; coordinate: LatLng; title: string; pinColor: string; zIndex: number }[] = [];
    if (restaurant) list.push({ id: 'restaurant', coordinate: restaurant, title: 'Restaurant', pinColor: PIN_RESTAURANT, zIndex: 10 });
    if (dropoff)    list.push({ id: 'home',       coordinate: dropoff,    title: 'Your home',  pinColor: PIN_HOME,       zIndex: 10 });
    if (driver)     list.push({ id: 'driver',     coordinate: driver,     title: 'Driver',     pinColor: PIN_DRIVER,     zIndex: 20 });
    console.log('[TrackingMap] markers:', list.map((m) => ({ id: m.id, lat: m.coordinate.latitude, lng: m.coordinate.longitude })));
    return list;
  }, [restaurant?.latitude, restaurant?.longitude, dropoff?.latitude, dropoff?.longitude, driver?.latitude, driver?.longitude]);

  const markerPoints = useMemo(
    () => collectMapCoordinates(restaurant, dropoff, driver),
    [restaurant, dropoff, driver],
  );

  const fitPoints = useMemo(() => {
    if (routeCoordinates.length >= 2) return collectMapCoordinates(...routeCoordinates, ...markerPoints);
    return markerPoints;
  }, [routeCoordinates, markerPoints]);

  const initialRegion = useMemo(() => computeFitRegion(markerPoints), [markerPoints]);

  // Debug
  useEffect(() => {
    console.log('[TrackingMap] restaurant:', JSON.stringify(restaurant));
    console.log('[TrackingMap] dropoff:', JSON.stringify(dropoff));
    console.log('[TrackingMap] driver:', JSON.stringify(driver));
    console.log('[TrackingMap] markerCount:', markerPoints.length);
  }, [restaurant?.latitude, dropoff?.latitude, driver?.latitude]);

  const seedPoint = driver ?? markerPoints[0] ?? null;

  // Seed animated region for driver
  useEffect(() => {
    if (!seedPoint || !AnimatedRegion) return;
    if (!animRef.current) {
      animRef.current = new AnimatedRegion({
        latitude:      seedPoint.latitude,
        longitude:     seedPoint.longitude,
        latitudeDelta:  0,
        longitudeDelta: 0,
      });
      seededRef.current = false;
    }
  }, [seedPoint?.latitude, seedPoint?.longitude]);

  // Animate driver movement
  useEffect(() => {
    if (!driver || !animRef.current) return;
    const anim = animRef.current;
    if (!seededRef.current) {
      anim.setValue({ ...driver, latitudeDelta: 0, longitudeDelta: 0 });
      lastDriverRef.current = driver;
      seededRef.current = true;
      return;
    }
    const prev = lastDriverRef.current;
    const km   = prev ? haversineDistanceKm(prev.latitude, prev.longitude, driver.latitude, driver.longitude) : 0;
    const duration = Math.min(2200, Math.max(700, Math.round(km * 12000)));
    lastDriverRef.current = driver;
    anim
      .timing({
        latitude:      driver.latitude,
        longitude:     driver.longitude,
        latitudeDelta:  0,
        longitudeDelta: 0,
        duration,
        useNativeDriver: false,
      } as never)
      .start();
  }, [driver?.latitude, driver?.longitude]);

  // Auto-fit after map ready / when points change
  useEffect(() => {
    if (!mapReady || !tracking) return;
    const pts = fitPoints.length ? fitPoints : markerPoints;
    if (!pts.length) return;
    const t = setTimeout(() => {
      if (pts.length === 1) {
        mapRef.current?.animateToRegion({ ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
      } else {
        fitMapToCoordinates(mapRef.current, pts, FIT_PAD);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [mapReady, tracking, fitPoints, markerPoints]);

  const recenter = useCallback(() => {
    setTracking(true);
    const pts = fitPoints.length ? fitPoints : markerPoints;
    if (pts.length === 1) {
      mapRef.current?.animateToRegion({ ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    } else {
      fitMapToCoordinates(mapRef.current, pts, FIT_PAD);
    }
  }, [fitPoints, markerPoints]);

  if (!MapView) {
    return <View style={styles.center}><ActivityIndicator color="#A855F7" /></View>;
  }

  if (!initialRegion) {
    return <View style={styles.center}><ActivityIndicator color="#A855F7" /></View>;
  }

  const driverAnim = animRef.current;

  return (
    <View style={styles.mapWrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={getNativeMapProvider()}
        initialRegion={initialRegion}
        userInterfaceStyle="light"
        showsCompass={false}
        showsScale={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
        zoomEnabled
        zoomTapEnabled
        scrollEnabled
        toolbarEnabled={false}
        onMapReady={() => setMapReady(true)}
        onPanDrag={() => setTracking(false)}
        onTouchStart={() => setTracking(false)}
      >
        {/* Route polyline */}
        {routeCoordinates.length >= 2 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#6D28D9"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Native pins — no custom children, works on iOS Google Maps */}
        {markers.map((m) =>
          m.id === 'driver' && driverAnim && MarkerAnimated ? (
            <MarkerAnimated
              key={m.id}
              identifier={m.id}
              coordinate={driverAnim as never}
              title={m.title}
              pinColor={m.pinColor}
              flat
              rotation={typeof driverHeading === 'number' ? driverHeading : 0}
              zIndex={m.zIndex}
              calloutEnabled={false}
            />
          ) : (
            <Marker
              key={m.id}
              identifier={m.id}
              coordinate={m.coordinate}
              title={m.title}
              pinColor={m.pinColor}
              zIndex={m.zIndex}
              calloutEnabled={false}
            />
          ),
        )}
      </MapView>

      {/* Recenter button */}
      <Pressable
        style={[styles.recenterBtn, tracking && styles.recenterActive]}
        onPress={recenter}
        accessibilityLabel="Show all markers"
      >
        <Ionicons name="scan-outline" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

// ── Public API ────────────────────────────────────────────────────────────────
export type CustomerTrackingMapProps = {
  order: RestaurantOrder;
  routeCoordinates?: LatLng[];
};

export function CustomerTrackingMap({ order, routeCoordinates: prop }: CustomerTrackingMapProps) {
  // ── Restaurant coordinate ──────────────────────────────────────────────────
  const restaurant = validCoord(toMapCoordinate(order.restaurantLocation));

  // ── Dropoff coordinate — try every possible field ─────────────────────────
  const dropoff = useMemo((): LatLng | null => {
    // 1. customerLocation {lat,lng} parsed by orderService
    const v1 = validCoord(toMapCoordinate(order.customerLocation));
    if (v1) return v1;
    // 2. deliveryLocation {lat,lng,address}
    const v2 = validCoord(toMapCoordinate(order.deliveryLocation));
    if (v2) return v2;
    // 3. userLocation {lat,lng}
    const v3 = validCoord(toMapCoordinate(order.userLocation));
    if (v3) return v3;
    // 4. Direct field access — handles any format missed by parseLegacyLatLng
    const dl = order.deliveryLocation as Record<string, unknown> | null | undefined;
    if (dl && typeof dl === 'object') {
      const lat = typeof dl.lat === 'number' ? dl.lat : typeof dl.latitude === 'number' ? dl.latitude : null;
      const lng = typeof dl.lng === 'number' ? dl.lng : typeof dl.longitude === 'number' ? dl.longitude : null;
      const c = lat !== null && lng !== null ? validCoord({ latitude: lat, longitude: lng }) : null;
      if (c) { console.log('[CTMap] dropoff via direct dl read'); return c; }
    }
    console.warn('[CTMap] dropoff is NULL');
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.customerLocation, order.deliveryLocation, order.userLocation]);

  console.log('[CTMap] restaurant:', JSON.stringify(restaurant), 'dropoff:', JSON.stringify(dropoff));

  const driver = order.driverLocation ? validCoord(toMapCoordinate(order.driverLocation)) : null;
  const driverHeading =
    typeof order.driverLocation?.heading === 'number' && Number.isFinite(order.driverLocation.heading)
      ? order.driverLocation.heading
      : null;

  const internalRoute = useLiveDeliveryRoute({
    restaurant,
    driver,
    customer: dropoff,
    enabled: prop == null,
  });

  const routeCoordinates = prop ?? internalRoute.coordinates;

  const pickupLabel  = order.restaurant?.address?.trim() || order.restaurant?.name || 'Restaurant';
  const dropoffLabel = order.deliveryLocation?.address?.trim() || order.customer?.address || 'Your address';

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
  mapWrap: { flex: 1, width: '100%', minHeight: 220 },

  center: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },

  recenterBtn: {
    position:     'absolute',
    right:        14,
    bottom:       16,
    width:        48,
    height:       48,
    borderRadius: 24,
    backgroundColor: '#1E1B4B',
    alignItems:   'center',
    justifyContent: 'center',
    shadowColor:  '#000',
    shadowOpacity: 0.3,
    shadowRadius:  8,
    shadowOffset:  { width: 0, height: 3 },
    elevation:    5,
  },
  recenterActive: { backgroundColor: '#7C3AED' },
});
