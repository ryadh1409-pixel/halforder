import { haversineDistanceKm } from '@/lib/haversine';
import {
  calculateETA,
  distanceKmBetween,
  formatCad,
  formatDistanceKm,
  type DeliveryMode,
  type FeeEstimate,
} from '@/lib/restaurantStoreMetrics';
import type {
  DeliveryDistanceTier,
  DeliveryEligibilityResult,
  RestaurantDeliverySettings,
} from '@/types/deliveryEligibility';

/** Marketplace default max delivery distance (km). */
export const DEFAULT_MAX_DELIVERY_DISTANCE_KM = 15;

export const TIER_NEAR_MAX_KM = 5;
export const TIER_MEDIUM_MAX_KM = 10;
export const TIER_LONG_MAX_KM = 15;

export const OUTSIDE_DELIVERY_AREA_MESSAGE =
  'This restaurant is outside your delivery area';

const LONG_DISTANCE_UNSUPPORTED_MESSAGE =
  'This restaurant does not deliver to your address';

/**
 * Parse delivery zone fields from a Firestore restaurant document.
 * Defaults are production-safe when fields are missing.
 */
export function parseRestaurantDeliverySettings(
  data: Record<string, unknown> | undefined,
): RestaurantDeliverySettings {
  const raw = data ?? {};
  const maxFromDoc =
    typeof raw.maxDeliveryDistanceKm === 'number' && Number.isFinite(raw.maxDeliveryDistanceKm)
      ? Math.max(0.5, raw.maxDeliveryDistanceKm)
      : null;
  const radiusFromDoc =
    typeof raw.deliveryRadiusKm === 'number' && Number.isFinite(raw.deliveryRadiusKm)
      ? Math.max(0.5, raw.deliveryRadiusKm)
      : null;

  const maxDeliveryDistanceKm =
    maxFromDoc ?? radiusFromDoc ?? DEFAULT_MAX_DELIVERY_DISTANCE_KM;

  const deliveryRadiusKm = radiusFromDoc ?? maxDeliveryDistanceKm;

  const baseDeliveryFee =
    typeof raw.baseDeliveryFee === 'number' && Number.isFinite(raw.baseDeliveryFee)
      ? Math.max(0, raw.baseDeliveryFee)
      : null;

  return {
    deliveryRadiusKm,
    supportsLongDistance: raw.supportsLongDistance === true,
    baseDeliveryFee,
    maxDeliveryDistanceKm,
  };
}

export function computeCustomerRestaurantDistanceKm(
  customer: { lat: number; lng: number } | null,
  restaurant: { lat: number; lng: number } | null,
): number | null {
  return distanceKmBetween(customer, restaurant);
}

function tierFromDistance(
  distanceKm: number,
  settings: RestaurantDeliverySettings,
): DeliveryDistanceTier {
  if (distanceKm > settings.maxDeliveryDistanceKm) return 'blocked';
  if (distanceKm > TIER_LONG_MAX_KM) return 'blocked';
  if (distanceKm > TIER_MEDIUM_MAX_KM) {
    return settings.supportsLongDistance ? 'long' : 'blocked';
  }
  if (distanceKm > TIER_NEAR_MAX_KM) return 'medium';
  return 'near';
}

/**
 * Tier-based delivery fee (CAD). Uses restaurant base fee when set, otherwise distance curve.
 */
export function deliveryFeeForTier(
  tier: DeliveryDistanceTier,
  distanceKm: number | null,
  settings: RestaurantDeliverySettings,
): FeeEstimate {
  if (tier === 'blocked' || tier === 'unknown') {
    return { amount: null, label: 'Delivery unavailable' };
  }

  if (settings.baseDeliveryFee != null) {
    let amount = settings.baseDeliveryFee;
    if (tier === 'medium') amount = roundCad(amount + 1.5);
    if (tier === 'long') amount = roundCad(amount + 3.5);
    return { amount, label: formatCad(amount) };
  }

  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return { amount: null, label: 'Calculated at checkout' };
  }

  let amount: number;
  if (distanceKm <= 2) {
    const t = distanceKm / 2;
    amount = roundCad(0.99 + t * (2.49 - 0.99));
  } else if (distanceKm <= TIER_NEAR_MAX_KM) {
    const t = (distanceKm - 2) / 3;
    amount = roundCad(2.49 + t * (4.99 - 2.49));
  } else if (distanceKm <= TIER_MEDIUM_MAX_KM) {
    const t = (distanceKm - TIER_NEAR_MAX_KM) / 5;
    amount = roundCad(4.99 + t * (6.99 - 4.99));
  } else {
    const t = Math.min(1, (distanceKm - TIER_MEDIUM_MAX_KM) / 5);
    amount = roundCad(6.99 + t * (8.99 - 6.99));
  }

  return { amount, label: formatCad(amount) };
}

function etaForTier(tier: DeliveryDistanceTier, distanceKm: number | null): string {
  if (tier === 'blocked' || tier === 'unknown') return 'Delivery unavailable';
  if (tier === 'long') {
    return distanceKm != null && distanceKm > 12 ? '45–60 min' : '40–55 min';
  }
  if (tier === 'medium') {
    return distanceKm != null && distanceKm > 7 ? '35–50 min' : '30–45 min';
  }
  return calculateETA({ mode: 'delivery', distanceKm });
}

function roundCad(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function evaluateDeliveryEligibility(params: {
  customer: { lat: number; lng: number } | null;
  restaurant: { lat: number; lng: number } | null;
  settings: RestaurantDeliverySettings;
  mode?: DeliveryMode;
}): DeliveryEligibilityResult {
  const { customer, restaurant, settings, mode = 'delivery' } = params;

  if (mode === 'pickup') {
    return {
      distanceKm: computeCustomerRestaurantDistanceKm(customer, restaurant),
      tier: 'near',
      deliverable: true,
      blocked: false,
      distanceLabel: formatDistanceKm(
        computeCustomerRestaurantDistanceKm(customer, restaurant),
      ),
      etaLabel: calculateETA({ mode: 'pickup', distanceKm: null }),
      deliveryFee: { amount: 0, label: 'No delivery fee' },
      message: null,
      statusLabel: 'Pickup available',
    };
  }

  const distanceKm = computeCustomerRestaurantDistanceKm(customer, restaurant);

  if (!customer || !restaurant) {
    return {
      distanceKm,
      tier: 'unknown',
      deliverable: false,
      blocked: true,
      distanceLabel: null,
      etaLabel: 'ETA unavailable',
      deliveryFee: { amount: null, label: 'Calculated at checkout' },
      message: 'Enable location to check delivery availability',
      statusLabel: 'Location required',
    };
  }

  if (distanceKm == null) {
    return {
      distanceKm: null,
      tier: 'unknown',
      deliverable: false,
      blocked: true,
      distanceLabel: null,
      etaLabel: 'ETA unavailable',
      deliveryFee: { amount: null, label: 'Calculated at checkout' },
      message: 'Could not calculate distance to this restaurant',
      statusLabel: 'Distance unavailable',
    };
  }

  const tier = tierFromDistance(distanceKm, settings);
  const blocked = tier === 'blocked';

  let message: string | null = null;
  if (distanceKm > settings.maxDeliveryDistanceKm || distanceKm >= DEFAULT_MAX_DELIVERY_DISTANCE_KM) {
    message = OUTSIDE_DELIVERY_AREA_MESSAGE;
  } else if (
    distanceKm > TIER_MEDIUM_MAX_KM &&
    distanceKm <= TIER_LONG_MAX_KM &&
    !settings.supportsLongDistance
  ) {
    message = LONG_DISTANCE_UNSUPPORTED_MESSAGE;
  }

  const deliverable = !blocked;
  const distanceLabel = formatDistanceKm(distanceKm);

  if (__DEV__) {
    console.log('[delivery.eligibility]', {
      distanceKm: Number(distanceKm.toFixed(2)),
      tier,
      deliverable,
      maxDeliveryDistanceKm: settings.maxDeliveryDistanceKm,
      supportsLongDistance: settings.supportsLongDistance,
    });
  }

  return {
    distanceKm,
    tier,
    deliverable,
    blocked,
    distanceLabel,
    etaLabel: etaForTier(tier, distanceKm),
    deliveryFee: deliveryFeeForTier(tier, distanceKm, settings),
    message,
    statusLabel: deliverable ? 'Delivery available' : 'Delivery unavailable',
  };
}

/**
 * Server-side guard before order write — re-fetches restaurant coords and validates distance.
 */
export function assertDeliveryEligibleForOrder(params: {
  deliveryType: 'delivery' | 'pickup';
  customerLat: number;
  customerLng: number;
  restaurantData: Record<string, unknown>;
  restaurantCoords: { lat: number; lng: number };
}): { distanceKm: number; tier: DeliveryDistanceTier; settings: RestaurantDeliverySettings } {
  const settings = parseRestaurantDeliverySettings(params.restaurantData);

  if (params.deliveryType === 'pickup') {
    const distanceKm = haversineDistanceKm(
      params.customerLat,
      params.customerLng,
      params.restaurantCoords.lat,
      params.restaurantCoords.lng,
    );
    return { distanceKm, tier: 'near', settings };
  }

  const eligibility = evaluateDeliveryEligibility({
    customer: { lat: params.customerLat, lng: params.customerLng },
    restaurant: params.restaurantCoords,
    settings,
    mode: 'delivery',
  });

  if (!eligibility.deliverable || eligibility.distanceKm == null) {
    const msg = eligibility.message ?? OUTSIDE_DELIVERY_AREA_MESSAGE;
    console.warn('[delivery.eligibility.blocked]', {
      distanceKm: eligibility.distanceKm,
      tier: eligibility.tier,
      message: msg,
    });
    throw new Error(msg);
  }

  return {
    distanceKm: eligibility.distanceKm,
    tier: eligibility.tier,
    settings,
  };
}
