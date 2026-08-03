/**
 * Presentation-only customer map camera modes for approach / arriving UX.
 * Does NOT write Firestore or invent order states — maps existing track steps
 * + optional distance into camera/framing choices.
 */
import type { CustomerTrackPhase } from '@/lib/customerTrackStatus';
import { canonicalizeCustomerTrackStep } from '@/lib/customerTrackStatus';
import type { DeliveryMapLeg } from '@/lib/maps/deliveryRouteStage';
import { haversineDistanceKm } from '@/lib/haversine';

export type CustomerMapCameraMode =
  | 'overview'
  | 'to_restaurant'
  | 'approach'
  | 'arriving'
  | 'arrived';

/** Presentation zoom radius — does not change deliveryStatus. */
export const APPROACH_NEARBY_RADIUS_M = 400;

export type LatLngLite = { latitude: number; longitude: number };

export function metersBetween(
  a: LatLngLite | null | undefined,
  b: LatLngLite | null | undefined,
): number | null {
  if (!a || !b) return null;
  if (!Number.isFinite(a.latitude) || !Number.isFinite(b.latitude)) return null;
  return haversineDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;
}

/**
 * Resolve map camera mode from existing customer track step + route leg + distance.
 */
export function resolveCustomerMapCameraMode(params: {
  step: CustomerTrackPhase | null | undefined;
  leg: DeliveryMapLeg;
  driverCustomerMeters: number | null;
  delivered?: boolean;
}): CustomerMapCameraMode {
  const step = canonicalizeCustomerTrackStep(params.step ?? 'order_placed');
  if (params.delivered || step === 'delivered') return 'arrived';
  if (step === 'cancelled') return 'overview';

  if (params.leg === 'to_customer') {
    const nearbyByState = step === 'driver_nearby';
    const nearbyByDistance =
      params.driverCustomerMeters != null &&
      params.driverCustomerMeters <= APPROACH_NEARBY_RADIUS_M &&
      (step === 'on_the_way' || step === 'picked_up' || nearbyByState);
    if (nearbyByState || nearbyByDistance) return 'arriving';
    if (step === 'on_the_way' || step === 'picked_up') return 'approach';
    return 'approach';
  }

  if (
    step === 'driver_assigned' ||
    step === 'waiting_at_restaurant' ||
    params.leg === 'to_restaurant'
  ) {
    return 'to_restaurant';
  }

  return 'overview';
}

export function cameraFitEdgePadding(mode: CustomerMapCameraMode): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  switch (mode) {
    case 'arriving':
      return { top: 100, right: 48, bottom: 220, left: 48 };
    case 'approach':
      return { top: 110, right: 52, bottom: 240, left: 52 };
    case 'to_restaurant':
      return { top: 120, right: 50, bottom: 200, left: 50 };
    case 'arrived':
      return { top: 120, right: 56, bottom: 200, left: 56 };
    default:
      return { top: 130, right: 50, bottom: 80, left: 50 };
  }
}

/** Region deltas when animating to a focused pair / single point. */
export function cameraRegionDeltas(mode: CustomerMapCameraMode): {
  latitudeDelta: number;
  longitudeDelta: number;
} {
  switch (mode) {
    case 'arriving':
      return { latitudeDelta: 0.008, longitudeDelta: 0.008 };
    case 'approach':
      return { latitudeDelta: 0.014, longitudeDelta: 0.014 };
    case 'arrived':
      return { latitudeDelta: 0.01, longitudeDelta: 0.01 };
    case 'to_restaurant':
      return { latitudeDelta: 0.02, longitudeDelta: 0.02 };
    default:
      return { latitudeDelta: 0.04, longitudeDelta: 0.04 };
  }
}

/**
 * Prefer points the camera should keep in view for the active mode.
 * Approach/arriving: driver + customer only (restaurant dropped from frame).
 */
export function selectCameraFocusPoints(params: {
  mode: CustomerMapCameraMode;
  restaurant: LatLngLite | null;
  driver: LatLngLite | null;
  customer: LatLngLite | null;
  routeCoordinates?: LatLngLite[];
}): LatLngLite[] {
  const { mode, restaurant, driver, customer, routeCoordinates = [] } = params;
  const pts: LatLngLite[] = [];

  if (mode === 'arrived') {
    if (customer) pts.push(customer);
    if (driver) pts.push(driver);
    return pts;
  }

  if (mode === 'approach' || mode === 'arriving') {
    if (driver) pts.push(driver);
    if (customer) pts.push(customer);
    // Keep a light route presence without ballooning the frame.
    if (routeCoordinates.length >= 2 && pts.length >= 2) {
      const mid = routeCoordinates[Math.floor(routeCoordinates.length / 2)];
      if (mid) pts.push(mid);
    }
    return pts;
  }

  if (mode === 'to_restaurant') {
    if (restaurant) pts.push(restaurant);
    if (driver) pts.push(driver);
    return pts;
  }

  if (restaurant) pts.push(restaurant);
  if (driver) pts.push(driver);
  if (customer) pts.push(customer);
  return pts;
}

/** Format floating map ETA badge — presentation only. */
export function formatRouteEtaBadge(
  etaMinutes: number | null | undefined,
  mode: CustomerMapCameraMode,
): string | null {
  if (mode === 'arrived') return null;
  if (mode !== 'approach' && mode !== 'arriving') return null;
  if (etaMinutes == null || !Number.isFinite(etaMinutes)) return null;
  const mins = Math.max(0, Math.round(etaMinutes));
  if (mins <= 0) return 'Arriving';
  if (mins === 1) return '1 min away';
  return `${mins} min away`;
}

/** Only refit camera when the driver meaningfully moved since last fit. */
export function shouldRefitApproachCamera(params: {
  tracking: boolean;
  modeChanged: boolean;
  force: boolean;
  lastFitDriver: LatLngLite | null;
  driver: LatLngLite | null;
  minMoveMeters?: number;
}): boolean {
  if (params.force || params.modeChanged) return true;
  if (!params.tracking) return false;
  if (!params.driver) return false;
  if (!params.lastFitDriver) return true;
  const moved = metersBetween(params.lastFitDriver, params.driver);
  const min = params.minMoveMeters ?? 55;
  return moved == null || moved >= min;
}
