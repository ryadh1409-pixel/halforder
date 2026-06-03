import type { FeeEstimate } from '@/lib/restaurantStoreMetrics';

/** Per-restaurant delivery zone configuration (Firestore `restaurants`). */
export type RestaurantDeliverySettings = {
  /** Legacy alias; used when maxDeliveryDistanceKm is unset. */
  deliveryRadiusKm: number;
  supportsLongDistance: boolean;
  baseDeliveryFee: number | null;
  maxDeliveryDistanceKm: number;
};

export type DeliveryDistanceTier = 'near' | 'medium' | 'long' | 'blocked' | 'unknown';

export type DeliveryEligibilityResult = {
  distanceKm: number | null;
  tier: DeliveryDistanceTier;
  /** Customer may complete a delivery order. */
  deliverable: boolean;
  /** Hard block (outside zone or long distance not supported). */
  blocked: boolean;
  distanceLabel: string | null;
  etaLabel: string;
  deliveryFee: FeeEstimate;
  /** Primary user-facing message when blocked or limited. */
  message: string | null;
  /** Short badge for cards, e.g. "Delivery unavailable". */
  statusLabel: string;
};
