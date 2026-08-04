/**
 * Customer live tracking map — native only.
 * Restaurant/home use native pins; driver uses a flat vehicle marker with
 * tracksViewChanges={false} (avoids PROVIDER_GOOGLE / iOS blank-snapshot bug).
 */
import { TrackingMapFallbackCard } from '@/components/maps/TrackingMapFallback';
import { LiveDriverVehicleMarker } from '@/components/maps/LiveDriverVehicleMarker';
import { RouteEtaBadge } from '@/components/maps/RouteEtaBadge';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
import { useLiveDriverMarker } from '@/hooks/useLiveDriverMarker';
import { collectMapCoordinates, toMapCoordinate } from '@/lib/location/coordinates';
import { fitMapToCoordinates, areMapCoordinatesDistinct } from '@/lib/maps/fitMapRegion';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import {
  MAP_Z_CUSTOMER,
  MAP_Z_CUSTOMER_ACTIVE,
  MAP_Z_DRIVER,
  MAP_Z_POLYLINE,
  MAP_Z_RESTAURANT,
  offsetDriverFromStops,
} from '@/lib/maps/mapMarkerLayers';
import {
  cameraFitEdgePadding,
  cameraRegionDeltas,
  formatRouteEtaBadge,
  metersBetween,
  resolveCustomerMapCameraMode,
  selectCameraFocusPoints,
  shouldRefitApproachCamera,
  type CustomerMapCameraMode,
} from '@/lib/maps/customerApproachCamera';
import { deliveryMapLegFromStatuses } from '@/lib/maps/deliveryRouteStage';
import { resolveCustomerTrackStep } from '@/lib/customerTrackStatus';
import { haversineDistanceKm } from '@/lib/haversine';
import { useGroupDeliverySiblingStops } from '@/hooks/useGroupDeliverySiblingStops';
import {
  resolveDeliveryCustomerStops,
  restaurantOrderToDeliveryStopSource,
} from '@/lib/maps/deliveryStops';
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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

// ── Lazy-load react-native-maps ───────────────────────────────────────────────
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
try {
  const rnm = require('react-native-maps');
  MapView        = rnm.default ?? rnm.MapView ?? rnm;
  Marker         = rnm.Marker;
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

function mapDevLog(...args: unknown[]) {
  if (__DEV__) console.log(...args);
}

const FIT_PAD = { top: 130, right: 50, bottom: 80, left: 50 };
const FIT_ANIM_MS = 650;

// Pin colours — native Google Maps pins (no custom React children)
const PIN_RESTAURANT = '#F59E0B'; // amber
const PIN_HOME       = '#22C55E'; // green
const PIN_DRIVER     = '#7C3AED'; // purple

// ── Inner map ─────────────────────────────────────────────────────────────────
function TrackingMapInner({
  restaurant,
  dropoff,
  extraCustomerStops = [],
  driver,
  driverHeading,
  routeCoordinates,
  expectDriver = false,
  cameraMode = 'overview',
  etaMinutes = null,
  lite = false,
  e2eCapture,
  e2ePhase,
}: {
  restaurant:       LatLng | null;
  dropoff:          LatLng | null;
  /** Other shared-delivery customers (excluding the viewer's home when possible). */
  extraCustomerStops?: { id: string; coordinate: LatLng; title: string }[];
  driver:           LatLng | null;
  driverHeading:    number | null;
  routeCoordinates: LatLng[];
  expectDriver?: boolean;
  cameraMode?: CustomerMapCameraMode;
  etaMinutes?: number | null;
  /** Compact non-interactive map for home Active Order Card. */
  lite?: boolean;
  e2eCapture?: boolean;
  e2ePhase?: string;
}) {
  const mapRef    = useRef<any>(null);
  const wrapRef   = useRef<View>(null);
  const capturedRef = useRef<string | false>(false);
  const layoutRef = useRef<{ width: number; height: number; x: number; y: number } | null>(null);
  const lastRegionRef = useRef<Record<string, number> | null>(null);
  const regionAtFitRef = useRef<Record<string, number> | null>(null);
  const fitSeqRef = useRef(0);
  const lastFitDriverRef = useRef<LatLng | null>(null);
  const lastCameraModeRef = useRef<CustomerMapCameraMode>(cameraMode);
  const provider = useMemo(() => getNativeMapProvider(), []);
  const [mapReady,  setMapReady]  = useState(false);
  const [tracking,  setTracking]  = useState(true);
  const hadDriverRef = useRef(false);

  const liveInput = useMemo(
    () =>
      driver
        ? {
            latitude: driver.latitude,
            longitude: driver.longitude,
            heading: driverHeading,
          }
        : null,
    [driver?.latitude, driver?.longitude, driverHeading],
  );

  const {
    coordinate: displayDriver,
    heading: resolvedHeading,
    awaitingFirstFix,
    waitingForLiveUpdate,
    animatedCoordinate,
  } = useLiveDriverMarker(liveInput);

  useEffect(() => {
    mapDevLog('[MAP RUNTIME] MapView provider', {
      provider,
      providerLabel:
        provider === 'google'
          ? 'PROVIDER_GOOGLE'
          : provider == null
            ? 'undefined(platform_default)'
            : String(provider),
    });
  }, [provider]);

  // When the live driver GPS first appears, re-enable auto camera fit.
  useEffect(() => {
    if (displayDriver && !hadDriverRef.current) {
      hadDriverRef.current = true;
      setTracking(true);
    }
  }, [displayDriver?.latitude, displayDriver?.longitude]);

  useEffect(() => {
    if (displayDriver) return;
    mapDevLog('[LIVE DRIVER MARKER]', {
      received: null,
      renderDecision: 'hide',
      reason: awaitingFirstFix
        ? 'awaiting_first_fix'
        : waitingForLiveUpdate
          ? 'waiting_for_live_update'
          : 'no_valid_driver_coordinate',
      expectDriver,
    });
  }, [displayDriver, awaitingFirstFix, waitingForLiveUpdate, expectDriver]);

  // ── Marker definitions ─────────────────────────────────────────────────────
  const driverDisplay = useMemo(
    () =>
      offsetDriverFromStops(displayDriver, [
        restaurant,
        dropoff,
        ...extraCustomerStops.map((s) => s.coordinate),
      ]),
    [displayDriver, restaurant, dropoff, extraCustomerStops],
  );

  const markers = useMemo(() => {
    const list: { id: string; coordinate: LatLng; title: string; pinColor: string; zIndex: number }[] = [];
    if (restaurant) {
      list.push({
        id: 'restaurant',
        coordinate: restaurant,
        title: 'Restaurant',
        pinColor: PIN_RESTAURANT,
        zIndex: MAP_Z_RESTAURANT,
      });
    }
    if (dropoff) {
      list.push({
        id: 'home',
        coordinate: dropoff,
        title: 'Your home',
        pinColor: PIN_HOME,
        zIndex: MAP_Z_CUSTOMER_ACTIVE,
      });
    }
    for (const stop of extraCustomerStops) {
      list.push({
        id: stop.id,
        coordinate: stop.coordinate,
        title: stop.title,
        pinColor: '#2563EB',
        zIndex: MAP_Z_CUSTOMER,
      });
    }
    if (driverDisplay) {
      list.push({
        id: 'driver',
        coordinate: driverDisplay,
        title: 'Driver',
        pinColor: PIN_DRIVER,
        zIndex: MAP_Z_DRIVER,
      });
    }
    if (__DEV__) {
      mapDevLog('[TrackingMap] markers.length =', list.length);
      mapDevLog(
        '[TrackingMap] markers[] =',
        list.map((m) => ({
          id: m.id,
          title: m.title,
          lat: m.coordinate.latitude,
          lng: m.coordinate.longitude,
        })),
      );
    }
    return list;
  }, [restaurant?.latitude, restaurant?.longitude, dropoff?.latitude, dropoff?.longitude, driverDisplay?.latitude, driverDisplay?.longitude, extraCustomerStops]);

  const markerPoints = useMemo(
    () => collectMapCoordinates(
      restaurant,
      dropoff,
      driverDisplay,
      ...extraCustomerStops.map((s) => s.coordinate),
    ),
    [restaurant, dropoff, driverDisplay, extraCustomerStops],
  );

  const fitPoints = useMemo(() => {
    const focus = selectCameraFocusPoints({
      mode: cameraMode,
      restaurant,
      driver: driverDisplay,
      customer: dropoff,
      routeCoordinates:
        cameraMode === 'approach' || cameraMode === 'arriving'
          ? routeCoordinates
          : [],
    });
    if (focus.length >= 1) return collectMapCoordinates(...focus);

    if (
      cameraMode === 'overview' &&
      routeCoordinates.length >= 2
    ) {
      return collectMapCoordinates(...routeCoordinates, ...markerPoints);
    }
    return markerPoints;
  }, [
    cameraMode,
    restaurant,
    driverDisplay,
    dropoff,
    routeCoordinates,
    markerPoints,
  ]);

  const etaBadgeLabel = useMemo(
    () => formatRouteEtaBadge(etaMinutes, cameraMode),
    [etaMinutes, cameraMode],
  );

  const initialRegion = useMemo(() => computeFitRegion(markerPoints), [markerPoints]);

  // Debug
  useEffect(() => {
    if (__DEV__) mapDevLog('[TrackingMap] restaurant:', JSON.stringify(restaurant));
    if (__DEV__) mapDevLog('[TrackingMap] dropoff:', JSON.stringify(dropoff));
    if (__DEV__) mapDevLog('[TrackingMap] driver:', JSON.stringify(displayDriver));
    if (__DEV__) mapDevLog('[TrackingMap] markerCount:', markerPoints.length);
    if (__DEV__) mapDevLog('[TrackingMap] cameraMode:', cameraMode);
  }, [restaurant?.latitude, dropoff?.latitude, displayDriver?.latitude, cameraMode]);

  const runCameraFit = useCallback(
    (force: boolean) => {
      if (!mapReady) return;
      const modeChanged = lastCameraModeRef.current !== cameraMode;
      const allow = shouldRefitApproachCamera({
        tracking,
        modeChanged,
        force,
        lastFitDriver: lastFitDriverRef.current,
        driver: driverDisplay,
        minMoveMeters:
          cameraMode === 'arriving' ? 35 : cameraMode === 'approach' ? 55 : 90,
      });
      if (!allow) return;

      const pts = fitPoints.length ? fitPoints : markerPoints;
      if (!pts.length) return;

      lastCameraModeRef.current = cameraMode;
      if (driverDisplay) lastFitDriverRef.current = driverDisplay;

      const pad = cameraFitEdgePadding(cameraMode);
      const deltas = cameraRegionDeltas(cameraMode);
      fitSeqRef.current += 1;
      const fitId = fitSeqRef.current;
      regionAtFitRef.current = lastRegionRef.current;

      mapDevLog('[MAP RUNTIME] approach camera fit', {
        fitId,
        cameraMode,
        force,
        modeChanged,
        pointCount: pts.length,
      });

      if (pts.length === 1 || !areMapCoordinatesDistinct(pts)) {
        mapRef.current?.animateToRegion(
          { ...pts[0], ...deltas },
          FIT_ANIM_MS,
        );
      } else if (cameraMode === 'arriving' || cameraMode === 'approach') {
        // Prefer a soft region animation for approach modes (less flash than repeated fitToCoordinates).
        const lats = pts.map((p) => p.latitude);
        const lngs = pts.map((p) => p.longitude);
        const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), deltas.latitudeDelta);
        const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), deltas.longitudeDelta);
        mapRef.current?.animateToRegion(
          {
            latitude: midLat,
            longitude: midLng,
            latitudeDelta: spanLat * 1.6,
            longitudeDelta: spanLng * 1.6,
          },
          FIT_ANIM_MS,
        );
      } else {
        fitMapToCoordinates(mapRef.current, pts, pad ?? FIT_PAD);
      }
    },
    [
      mapReady,
      tracking,
      cameraMode,
      driverDisplay,
      fitPoints,
      markerPoints,
    ],
  );

  // Auto-fit after map ready / when points change (throttled in approach modes)
  useEffect(() => {
    if (!mapReady || !tracking) {
      if (__DEV__) mapDevLog('[MAP RUNTIME] fit effect gated', { mapReady, tracking });
      return;
    }
    const t = setTimeout(() => {
      runCameraFit(false);
    }, cameraMode === 'approach' || cameraMode === 'arriving' ? 420 : 600);
    return () => clearTimeout(t);
  }, [mapReady, tracking, fitPoints, markerPoints, cameraMode, runCameraFit]);

  // When camera mode changes (e.g. on_the_way → nearby), re-enable tracking once.
  useEffect(() => {
    if (cameraMode === 'approach' || cameraMode === 'arriving' || cameraMode === 'to_restaurant') {
      setTracking(true);
    }
  }, [cameraMode]);

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
        mapDevLog('[E2E VERIFY] SCREENSHOT CAPTURED', {
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
        if (__DEV__) console.warn(
          '[E2E VERIFY] screenshot failed',
          err instanceof Error ? err.message : String(err),
        );
      }
    }, 1800);
    return () => clearTimeout(t);
  }, [e2eCapture, e2ePhase, mapReady, markers]);

  const recenter = useCallback(() => {
    if (lite) return;
    setTracking(true);
    // Force a fresh fit on recenter even for small driver moves.
    lastFitDriverRef.current = null;
    requestAnimationFrame(() => runCameraFit(true));
  }, [runCameraFit, lite]);

  const showWaitingBanner = Boolean(expectDriver && !displayDriver && !lite);

  useEffect(() => {
    if (!showWaitingBanner) {
      if (expectDriver && displayDriver) {
        mapDevLog('[WAITING BANNER CLEARED]', {
          latitude: displayDriver.latitude,
          longitude: displayDriver.longitude,
        });
      }
      return;
    }
    mapDevLog('[WAITING BANNER]', {
      visible: true,
      reason: 'no_valid_driver_coordinate',
      expectDriver,
    });
  }, [
    showWaitingBanner,
    expectDriver,
    displayDriver?.latitude,
    displayDriver?.longitude,
  ]);

  if (!MapView) {
    return <View style={styles.center}><ActivityIndicator color="#A855F7" /></View>;
  }

  if (!initialRegion) {
    return <View style={styles.center}><ActivityIndicator color="#A855F7" /></View>;
  }

  return (
    <View
      style={styles.mapWrap}
      ref={wrapRef}
      collapsable={false}
      onLayout={(e) => {
        const { width, height, x, y } = e.nativeEvent.layout;
        layoutRef.current = { width, height, x, y };
        mapDevLog('[MAP RUNTIME] onLayout()', {
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
        zoomEnabled={!lite}
        zoomTapEnabled={!lite}
        scrollEnabled={!lite}
        toolbarEnabled={false}
        onMapReady={() => {
          const layout = layoutRef.current;
          mapDevLog('[MAP RUNTIME] MapView onMapReady()', {
            provider,
            layout,
            layoutZero: !layout || layout.width < 2 || layout.height < 2,
            lite,
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
        }}
        onPanDrag={lite ? undefined : () => setTracking(false)}
      >
        {/* Route polyline */}
        {routeCoordinates.length >= 2 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#6D28D9"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            zIndex={MAP_Z_POLYLINE}
          />
        )}

        {/* Restaurant + home: native pins. Driver: shared live vehicle marker. */}
        {markers
          .filter((m) => m.id !== 'driver')
          .map((m) => (
            <Marker
              key={m.id}
              identifier={m.id}
              coordinate={m.coordinate}
              title={m.title}
              pinColor={m.pinColor}
              zIndex={m.zIndex}
              calloutEnabled={false}
            />
          ))}

        {driverDisplay ? (
          <LiveDriverVehicleMarker
            coordinate={driverDisplay}
            heading={resolvedHeading}
            title="Driver"
            animatedCoordinate={animatedCoordinate}
            zIndex={MAP_Z_DRIVER}
          />
        ) : null}
      </MapView>

      {showWaitingBanner ? (
        <View style={styles.waitingBanner} pointerEvents="none">
          <Text style={styles.waitingText}>Waiting for driver location…</Text>
        </View>
      ) : null}

      {!lite ? (
        <RouteEtaBadge
          label={etaBadgeLabel}
          visible={Boolean(etaBadgeLabel) && !showWaitingBanner}
        />
      ) : null}

      {/* Recenter button */}
      {!lite ? (
        <Pressable
          style={[styles.recenterBtn, tracking && styles.recenterActive]}
          onPress={recenter}
          accessibilityRole="button"
          accessibilityLabel="Recenter map on delivery"
        >
          <Ionicons name="scan-outline" size={22} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Public API ────────────────────────────────────────────────────────────────
export type CustomerTrackingMapProps = {
  order: RestaurantOrder;
  routeCoordinates?: LatLng[];
  /** Optional live ETA minutes from parent (avoids duplicate Directions). */
  etaMinutes?: number | null;
  /** Compact non-interactive map for home Active Order Card. */
  lite?: boolean;
  /** DEV: capture map screenshot after markers settle */
  e2eCapture?: boolean;
  e2ePhase?: string;
};

export function CustomerTrackingMap({
  order,
  routeCoordinates: prop,
  etaMinutes: etaProp,
  lite = false,
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

  const siblingStops = useGroupDeliverySiblingStops(
    lite ? null : order.groupId,
    lite ? null : order.id,
  );

  const sharedCustomerStops = useMemo(() => {
    if (lite) return [];
    const source = restaurantOrderToDeliveryStopSource(order);
    const stops = resolveDeliveryCustomerStops(source, siblingStops);
    return stops
      .filter((stop) => {
        if (!dropoff) return true;
        const dlat = Math.abs(stop.coordinate.latitude - dropoff.latitude);
        const dlng = Math.abs(stop.coordinate.longitude - dropoff.longitude);
        return dlat > 1e-5 || dlng > 1e-5;
      })
      .map((stop) => ({
        id: stop.id,
        coordinate: stop.coordinate,
        title: stop.label,
      }));
  }, [
    lite,
    order,
    siblingStops,
    dropoff?.latitude,
    dropoff?.longitude,
  ]);

  const remainingForRoute = useMemo(
    () => sharedCustomerStops.map((s) => s.coordinate),
    [sharedCustomerStops],
  );

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

    if (__DEV__) mapDevLog('[MARKERS INVESTIGATION] orderId=', order.id);
    if (__DEV__) mapDevLog('[MARKERS INVESTIGATION] Restaurant', restaurantAudit);
    if (__DEV__) mapDevLog('[MARKERS INVESTIGATION] Customer', customerAudit);
    if (__DEV__) mapDevLog('[MARKERS INVESTIGATION] Driver', driverAudit);
    if (__DEV__) mapDevLog('[MARKERS INVESTIGATION] markers.length (expected in TrackingMapInner)=', plannedMarkers.length);
    if (__DEV__) mapDevLog('[MARKERS INVESTIGATION] markers[]=', plannedMarkers);
    mapDevLog('[MARKERS INVESTIGATION] distances_meters', {
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
    remainingCustomers: remainingForRoute,
    enabled: prop == null,
    deliveryStatus: order.deliveryStatus,
    kitchenStatus: order.status,
  });

  const routeCoordinates = prop ?? internalRoute.coordinates;
  const etaMinutes =
    etaProp != null && Number.isFinite(etaProp)
      ? etaProp
      : internalRoute.etaMinutes;

  const trackStep = useMemo(() => resolveCustomerTrackStep(order), [order]);
  const mapLeg = useMemo(
    () => deliveryMapLegFromStatuses(order.deliveryStatus, order.status),
    [order.deliveryStatus, order.status],
  );
  const driverCustomerMeters = useMemo(
    () => metersBetween(driver, dropoff),
    [driver?.latitude, driver?.longitude, dropoff?.latitude, dropoff?.longitude],
  );
  const cameraMode = useMemo(
    () =>
      lite
        ? 'overview'
        : resolveCustomerMapCameraMode({
            step: trackStep,
            leg: mapLeg,
            driverCustomerMeters,
            delivered:
              trackStep === 'delivered' ||
              order.status === 'delivered' ||
              order.status === 'completed' ||
              order.deliveryStatus === 'delivered',
          }),
    [
      lite,
      trackStep,
      mapLeg,
      driverCustomerMeters,
      order.status,
      order.deliveryStatus,
    ],
  );

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
        extraCustomerStops={sharedCustomerStops}
        driver={driver}
        driverHeading={driverHeading}
        routeCoordinates={routeCoordinates}
        expectDriver={Boolean(order.driverId || order.assignedDriverId)}
        cameraMode={cameraMode}
        etaMinutes={lite ? null : etaMinutes}
        lite={lite}
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

  waitingBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 72,
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
