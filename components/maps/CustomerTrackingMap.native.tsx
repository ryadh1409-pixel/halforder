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
  e2eCapture,
  e2ePhase,
}: {
  restaurant:       LatLng | null;
  dropoff:          LatLng | null;
  driver:           LatLng | null;
  driverHeading:    number | null;
  routeCoordinates: LatLng[];
  e2eCapture?: boolean;
  e2ePhase?: string;
}) {
  const mapRef    = useRef<any>(null);
  const wrapRef   = useRef<View>(null);
  const animRef   = useRef<any>(null);
  const lastDriverRef = useRef<LatLng | null>(null);
  const seededRef = useRef(false);
  const capturedRef = useRef<string | false>(false);
  const layoutRef = useRef<{ width: number; height: number; x: number; y: number } | null>(null);
  const lastRegionRef = useRef<Record<string, number> | null>(null);
  const regionAtFitRef = useRef<Record<string, number> | null>(null);
  const fitSeqRef = useRef(0);
  const provider = useMemo(() => getNativeMapProvider(), []);
  const [mapReady,  setMapReady]  = useState(false);
  const [tracking,  setTracking]  = useState(true);

  useEffect(() => {
    console.log('[MAP RUNTIME] MapView provider', {
      provider,
      providerLabel:
        provider === 'google'
          ? 'PROVIDER_GOOGLE'
          : provider == null
            ? 'undefined(platform_default)'
            : String(provider),
    });
  }, [provider]);

  // ── Marker definitions (native pins — no custom children) ──────────────────
  const markers = useMemo(() => {
    const list: { id: string; coordinate: LatLng; title: string; pinColor: string; zIndex: number }[] = [];
    if (restaurant) list.push({ id: 'restaurant', coordinate: restaurant, title: 'Restaurant', pinColor: PIN_RESTAURANT, zIndex: 10 });
    if (dropoff)    list.push({ id: 'home',       coordinate: dropoff,    title: 'Your home',  pinColor: PIN_HOME,       zIndex: 10 });
    if (driver)     list.push({ id: 'driver',     coordinate: driver,     title: 'Driver',     pinColor: PIN_DRIVER,     zIndex: 20 });
    console.log('[TrackingMap] markers.length =', list.length);
    console.log('[TrackingMap] markers[] =', list.map((m) => ({
      id: m.id,
      title: m.title,
      lat: m.coordinate.latitude,
      lng: m.coordinate.longitude,
    })));
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
    if (!mapReady || !tracking) {
      console.log('[MAP RUNTIME] fit effect gated', { mapReady, tracking });
      return;
    }
    const pts = fitPoints.length ? fitPoints : markerPoints;
    if (!pts.length) return;
    const t = setTimeout(() => {
      const layout = layoutRef.current;
      const regionBefore = lastRegionRef.current;
      regionAtFitRef.current = regionBefore;
      fitSeqRef.current += 1;
      const fitId = fitSeqRef.current;

      console.log('[MAP RUNTIME] about to fit', {
        fitId,
        mapReady,
        tracking,
        layout,
        layoutZero:
          !layout || layout.width < 2 || layout.height < 2,
        regionBefore,
        pointCount: pts.length,
        animateCameraCalled: false,
        note: 'this map path uses fitToCoordinates / animateToRegion only — animateCamera() is never called',
      });

      if (pts.length === 1) {
        console.log('[MAP RUNTIME] animateToRegion() called (single point)', {
          fitId,
          coordinate: pts[0],
        });
        mapRef.current?.animateToRegion(
          { ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
          500,
        );
      } else {
        fitMapToCoordinates(mapRef.current, pts, FIT_PAD);
      }

      // Screenshot immediately after camera request
      const shotDelay = setTimeout(async () => {
        const regionAfter = lastRegionRef.current;
        const before = regionAtFitRef.current;
        const regionChanged =
          !!before &&
          !!regionAfter &&
          (Math.abs((before.latitude ?? 0) - (regionAfter.latitude ?? 0)) > 1e-6 ||
            Math.abs((before.longitude ?? 0) - (regionAfter.longitude ?? 0)) > 1e-6 ||
            Math.abs((before.latitudeDelta ?? 0) - (regionAfter.latitudeDelta ?? 0)) > 1e-6 ||
            Math.abs((before.longitudeDelta ?? 0) - (regionAfter.longitudeDelta ?? 0)) > 1e-6);

        console.log('[MAP RUNTIME] post-fit region check', {
          fitId,
          regionBefore: before,
          regionAfter,
          regionChanged,
          layout: layoutRef.current,
          possibleIgnoreReasons: !regionChanged
            ? [
                !layout || layout.width < 2 || layout.height < 2
                  ? 'zero_or_tiny_layout'
                  : null,
                !mapReady ? 'map_not_ready' : null,
                before == null
                  ? 'no_onRegionChangeComplete_yet'
                  : null,
                before &&
                regionAfter &&
                Math.abs((before.latitude ?? 0) - (regionAfter.latitude ?? 0)) < 1e-6 &&
                Math.abs((before.latitudeDelta ?? 0) - (regionAfter.latitudeDelta ?? 0)) < 1e-6
                  ? 'region_already_matched_fit_target_or_native_ignored'
                  : null,
              ].filter(Boolean)
            : [],
        });

        if (!wrapRef.current) return;
        try {
          const { captureRef } = require('react-native-view-shot') as {
            captureRef: (
              target: View,
              opts: { format: string; quality: number; result: string },
            ) => Promise<string>;
          };
          const uri = await captureRef(wrapRef.current, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          });
          console.log('[MAP RUNTIME] screenshot immediately after fitToCoordinates()', {
            fitId,
            uri,
            regionChanged,
            markerCount: markers.length,
          });
        } catch (err) {
          console.warn(
            '[MAP RUNTIME] post-fit screenshot failed',
            err instanceof Error ? err.message : String(err),
          );
        }
      }, 250);
      // stash clear on effect cleanup via outer return
      (mapRef as any)._postFitShot = shotDelay;
    }, 600);
    return () => {
      clearTimeout(t);
      if ((mapRef as any)._postFitShot) {
        clearTimeout((mapRef as any)._postFitShot);
      }
    };
  }, [mapReady, tracking, fitPoints, markerPoints, markers.length]);

  // DEV E2E: screenshot after markers + fit settle (re-capture when marker count changes)
  useEffect(() => {
    if (!__DEV__ || !e2eCapture || !mapReady) return;
    if (markers.length < 2) return;
    const captureKey = `${e2ePhase ?? 'x'}:${markers.length}:${markers
      .map((m) => m.id)
      .join(',')}`;
    const t = setTimeout(async () => {
      if (!wrapRef.current) return;
      if ((capturedRef.current as string | false) === captureKey) return;
      try {
        const { captureRef } = require('react-native-view-shot') as {
          captureRef: (
            target: View,
            opts: { format: string; quality: number; result: string },
          ) => Promise<string>;
        };
        const uri = await captureRef(wrapRef.current, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        capturedRef.current = captureKey as never;
        console.log('[E2E VERIFY] SCREENSHOT CAPTURED', {
          phase: e2ePhase ?? 'unknown',
          captureKey,
          markerCount: markers.length,
          markers: markers.map((m) => ({
            id: m.id,
            title: m.title,
            lat: m.coordinate.latitude,
            lng: m.coordinate.longitude,
          })),
          uri,
        });
      } catch (err) {
        console.warn(
          '[E2E VERIFY] screenshot failed',
          err instanceof Error ? err.message : String(err),
        );
      }
    }, 1800);
    return () => clearTimeout(t);
  }, [e2eCapture, e2ePhase, mapReady, markers]);

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
    <View
      style={styles.mapWrap}
      ref={wrapRef}
      collapsable={false}
      onLayout={(e) => {
        const { width, height, x, y } = e.nativeEvent.layout;
        layoutRef.current = { width, height, x, y };
        console.log('[MAP RUNTIME] onLayout()', {
          width,
          height,
          x,
          y,
          zeroSize: width < 2 || height < 2,
        });
      }}
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={provider}
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
        onMapReady={() => {
          const layout = layoutRef.current;
          console.log('[MAP RUNTIME] MapView onMapReady()', {
            provider,
            layout,
            layoutZero: !layout || layout.width < 2 || layout.height < 2,
            hasFitToCoordinates: typeof mapRef.current?.fitToCoordinates === 'function',
            hasAnimateCamera: typeof mapRef.current?.animateCamera === 'function',
            hasAnimateToRegion: typeof mapRef.current?.animateToRegion === 'function',
            initialRegion,
          });
          setMapReady(true);
        }}
        onRegionChangeComplete={(region: {
          latitude: number;
          longitude: number;
          latitudeDelta: number;
          longitudeDelta: number;
        }) => {
          lastRegionRef.current = region;
          console.log('[MAP RUNTIME] onRegionChangeComplete()', {
            latitude: region.latitude,
            longitude: region.longitude,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
            vsRegionAtFit: regionAtFitRef.current,
          });
        }}
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
  /** DEV: capture map screenshot after markers settle */
  e2eCapture?: boolean;
  e2ePhase?: string;
};

export function CustomerTrackingMap({
  order,
  routeCoordinates: prop,
  e2eCapture,
  e2ePhase,
}: CustomerTrackingMapProps) {
  // ── Investigation: trace Firestore-mapped fields → marker inclusion ────────
  const rawRestaurantLoc = order.restaurantLocation;
  const rawCustomerLoc = order.customerLocation;
  const rawUserLoc = order.userLocation;
  const rawDeliveryLoc = order.deliveryLocation;
  const rawDriverLoc = order.driverLocation;
  const restaurantSnapLat = order.restaurant?.latitude ?? null;
  const restaurantSnapLng = order.restaurant?.longitude ?? null;

  const parsedRestaurantLoc = toMapCoordinate(rawRestaurantLoc);
  const parsedRestaurantSnap =
    restaurantSnapLat != null && restaurantSnapLng != null
      ? { latitude: restaurantSnapLat, longitude: restaurantSnapLng }
      : null;
  const parsedCustomerLoc = toMapCoordinate(rawCustomerLoc);
  const parsedUserLoc = toMapCoordinate(rawUserLoc);
  const parsedDeliveryLoc = toMapCoordinate(rawDeliveryLoc);
  const parsedDriverLoc = rawDriverLoc ? toMapCoordinate(rawDriverLoc) : null;

  // ── Restaurant coordinate ──────────────────────────────────────────────────
  const restaurantFromField = validCoord(parsedRestaurantLoc);
  const restaurantFromSnap = validCoord(parsedRestaurantSnap);
  const restaurant = restaurantFromField ?? restaurantFromSnap;

  // ── Dropoff coordinate — try every possible field ─────────────────────────
  const dropoff = useMemo((): LatLng | null => {
    const v1 = validCoord(toMapCoordinate(order.customerLocation));
    if (v1) return v1;
    const v2 = validCoord(toMapCoordinate(order.deliveryLocation));
    if (v2) return v2;
    const v3 = validCoord(toMapCoordinate(order.userLocation));
    if (v3) return v3;
    const dl = order.deliveryLocation as Record<string, unknown> | null | undefined;
    if (dl && typeof dl === 'object') {
      const lat = typeof dl.lat === 'number' ? dl.lat : typeof dl.latitude === 'number' ? dl.latitude : null;
      const lng = typeof dl.lng === 'number' ? dl.lng : typeof dl.longitude === 'number' ? dl.longitude : null;
      const c = lat !== null && lng !== null ? validCoord({ latitude: lat, longitude: lng }) : null;
      if (c) return c;
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.customerLocation, order.deliveryLocation, order.userLocation]);

  const driver = order.driverLocation ? validCoord(toMapCoordinate(order.driverLocation)) : null;
  const driverHeading =
    typeof order.driverLocation?.heading === 'number' && Number.isFinite(order.driverLocation.heading)
      ? order.driverLocation.heading
      : null;

  // ── Per-marker include/exclude audit (data investigation) ──────────────────
  useEffect(() => {
    const deliveryIsNullIsland =
      parsedDeliveryLoc != null &&
      Math.abs(parsedDeliveryLoc.latitude) < 0.001 &&
      Math.abs(parsedDeliveryLoc.longitude) < 0.001;

    const restaurantAudit = {
      sourceDocument: 'orders/{id}.restaurantLocation | orders/{id}.restaurant.{latitude,longitude}',
      fileCreates: 'services/orderService.ts mapDocToRestaurantOrderFromData (~400–510)',
      rawRestaurantLocation: rawRestaurantLoc,
      rawRestaurantSnap: { lat: restaurantSnapLat, lng: restaurantSnapLng },
      parsedRestaurantLoc,
      parsedRestaurantSnap,
      afterValidCoord_field: restaurantFromField,
      afterValidCoord_snap: restaurantFromSnap,
      status: restaurant ? 'INCLUDED' : 'EXCLUDED',
      reason: restaurant
        ? restaurantFromField
          ? 'included from order.restaurantLocation'
          : 'included from order.restaurant.latitude/longitude fallback'
        : !parsedRestaurantLoc && !parsedRestaurantSnap
          ? 'coordinates missing on restaurantLocation AND restaurant snapshot'
          : 'coordinates rejected by validCoord() (null-island / invalid)',
      latitude: restaurant?.latitude ?? null,
      longitude: restaurant?.longitude ?? null,
    };

    const customerAudit = {
      sourceDocument:
        'orders/{id}.customerLocation | userLocation | deliveryLocation',
      fileCreates: 'services/orderService.ts (~395–505) + resolveMappedDeliveryLocation (~268–302)',
      rawCustomerLocation: rawCustomerLoc,
      rawUserLocation: rawUserLoc,
      rawDeliveryLocation: rawDeliveryLoc,
      parsedCustomerLoc,
      parsedUserLoc,
      parsedDeliveryLoc,
      deliveryIsNullIsland,
      status: dropoff ? 'INCLUDED' : 'EXCLUDED',
      reason: dropoff
        ? 'included from first valid of customerLocation/deliveryLocation/userLocation'
        : deliveryIsNullIsland && !validCoord(parsedCustomerLoc) && !validCoord(parsedUserLoc)
          ? 'EXCLUDED: deliveryLocation is Null Island {lat:0,lng:0} (placeholder from resolveMappedDeliveryLocation when address exists without GPS) and customerLocation/userLocation are null/invalid — validCoord() strips 0,0'
          : 'EXCLUDED: no finite non-zero lat/lng on customerLocation, deliveryLocation, or userLocation',
      latitude: dropoff?.latitude ?? null,
      longitude: dropoff?.longitude ?? null,
    };

    const driverAudit = {
      sourceDocument: 'orders/{id}.driverLocation (written by driver GPS sync)',
      fileCreates: 'services/location/driverTracking.ts → orders.driverLocation',
      rawDriverLocation: rawDriverLoc,
      parsedDriverLoc,
      status: driver ? 'INCLUDED' : 'EXCLUDED',
      reason: driver
        ? 'included from order.driverLocation'
        : !rawDriverLoc
          ? 'EXCLUDED: order.driverLocation is null (driver not assigned or GPS not synced yet)'
          : 'EXCLUDED: driverLocation present but rejected by validCoord()',
      latitude: driver?.latitude ?? null,
      longitude: driver?.longitude ?? null,
    };

    const plannedMarkers = [
      restaurant ? { id: 'restaurant', ...restaurant } : null,
      dropoff ? { id: 'home', ...dropoff } : null,
      driver ? { id: 'driver', ...driver } : null,
    ].filter(Boolean);

    const dist = (a: LatLng | null, b: LatLng | null) =>
      a && b ? haversineDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000 : null;

    const dRC = dist(restaurant, dropoff);
    const dRD = dist(restaurant, driver);
    const dCD = dist(dropoff, driver);

    console.log('[MARKERS INVESTIGATION] orderId=', order.id);
    console.log('[MARKERS INVESTIGATION] Restaurant', restaurantAudit);
    console.log('[MARKERS INVESTIGATION] Customer', customerAudit);
    console.log('[MARKERS INVESTIGATION] Driver', driverAudit);
    console.log('[MARKERS INVESTIGATION] markers.length (expected in TrackingMapInner)=', plannedMarkers.length);
    console.log('[MARKERS INVESTIGATION] markers[]=', plannedMarkers);
    console.log('[MARKERS INVESTIGATION] distances_meters', {
      restaurant_customer_m: dRC,
      restaurant_driver_m: dRD,
      customer_driver_m: dCD,
      overlap_restaurant_customer: dRC != null && dRC < 2,
      overlap_restaurant_driver: dRD != null && dRD < 2,
      overlap_customer_driver: dCD != null && dCD < 2,
    });
  }, [
    order.id,
    restaurant,
    dropoff,
    driver,
    rawRestaurantLoc,
    rawCustomerLoc,
    rawUserLoc,
    rawDeliveryLoc,
    rawDriverLoc,
    restaurantSnapLat,
    restaurantSnapLng,
    parsedRestaurantLoc,
    parsedRestaurantSnap,
    parsedCustomerLoc,
    parsedUserLoc,
    parsedDeliveryLoc,
    parsedDriverLoc,
    restaurantFromField,
    restaurantFromSnap,
  ]);

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
        e2eCapture={e2eCapture}
        e2ePhase={e2ePhase}
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
