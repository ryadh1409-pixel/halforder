/**
 * Single courier-lifecycle display mapper for Driver Hub, Driver Map,
 * Customer Tracking, Restaurant, and Admin.
 *
 * Firestore source of truth: `orders.deliveryStatus` (raw). Kitchen `status`
 * is only a fallback for terminal delivered/cancelled.
 *
 * Fulfillment buttons still use {@link normalizeMarketplaceDeliveryStatus}
 * (business transitions unchanged). This module is display-only.
 */

import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
  type MarketplaceDeliveryStatus,
} from '@/lib/orderStatus';

export type CanonicalDeliveryDisplayStage =
  | 'awaiting_restaurant'
  | 'restaurant_accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'driver_assigned'
  | 'waiting_at_restaurant'
  | 'picked_up'
  | 'on_the_way'
  | 'nearby'
  | 'delivered'
  | 'cancelled';

const LABELS: Record<CanonicalDeliveryDisplayStage, string> = {
  awaiting_restaurant: 'Awaiting restaurant',
  restaurant_accepted: 'Restaurant accepted',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  driver_assigned: 'Driver assigned',
  waiting_at_restaurant: 'Waiting at restaurant',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  nearby: 'Nearby',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Human label for a resolved display stage. */
export function canonicalDeliveryStageLabel(
  stage: CanonicalDeliveryDisplayStage,
): string {
  return LABELS[stage];
}

/**
 * Resolve the display stage from raw Firestore courier (+ optional kitchen) fields.
 * Reads raw `on_the_way` / `near_customer` before marketplace normalize collapses them.
 */
export function resolveCanonicalDeliveryDisplayStage(
  deliveryStatus: unknown,
  kitchenStatus?: unknown,
): CanonicalDeliveryDisplayStage {
  const rawDs = norm(deliveryStatus);
  const rawKitchen = norm(kitchenStatus);

  if (
    rawDs === 'cancelled' ||
    rawDs === 'rejected' ||
    rawKitchen === 'cancelled' ||
    rawKitchen === 'rejected'
  ) {
    return 'cancelled';
  }

  if (
    rawDs === 'delivered' ||
    rawDs === 'completed' ||
    rawKitchen === 'delivered' ||
    rawKitchen === 'completed'
  ) {
    return 'delivered';
  }

  // Fine-grained courier stages (before normalize collapses them into picked_up).
  if (
    rawDs === 'near_customer' ||
    rawDs === 'arrived_customer' ||
    rawDs === 'arrived_nearby'
  ) {
    return 'nearby';
  }
  if (
    rawDs === 'on_the_way' ||
    rawDs === 'heading_to_customer' ||
    rawDs === 'en_route_to_customer'
  ) {
    return 'on_the_way';
  }
  if (
    rawDs === 'arrived_restaurant' ||
    rawDs === 'arriving_restaurant' ||
    rawDs === 'driver_at_restaurant'
  ) {
    return 'waiting_at_restaurant';
  }

  const normalized = normalizeMarketplaceDeliveryStatus(deliveryStatus);
  switch (normalized) {
    case MARKETPLACE_DELIVERY_STATUS.DELIVERED:
      return 'delivered';
    case MARKETPLACE_DELIVERY_STATUS.CANCELLED:
      return 'cancelled';
    case MARKETPLACE_DELIVERY_STATUS.PICKED_UP:
      return 'picked_up';
    case MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED:
      return 'driver_assigned';
    case MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP:
      return 'waiting_at_restaurant';
    case MARKETPLACE_DELIVERY_STATUS.PREPARING:
      return 'preparing';
    case MARKETPLACE_DELIVERY_STATUS.ACCEPTED:
      return 'restaurant_accepted';
    case MARKETPLACE_DELIVERY_STATUS.PENDING:
    default:
      return 'awaiting_restaurant';
  }
}

/** Label from raw deliveryStatus (+ optional kitchen status). */
export function canonicalDeliveryStatusLabel(
  deliveryStatus: unknown,
  kitchenStatus?: unknown,
): string {
  return canonicalDeliveryStageLabel(
    resolveCanonicalDeliveryDisplayStage(deliveryStatus, kitchenStatus),
  );
}

/**
 * Shared alias — every surface that previously called
 * `marketplaceDeliveryStatusLabel` must go through this mapper.
 */
export function marketplaceDeliveryStatusLabel(
  deliveryStatus: unknown,
  kitchenStatus?: unknown,
): string {
  return canonicalDeliveryStatusLabel(deliveryStatus, kitchenStatus);
}

/** Marketplace enum used by fulfillment buttons / gates (unchanged transitions). */
export function canonicalMarketplaceDeliveryStatus(
  deliveryStatus: unknown,
): MarketplaceDeliveryStatus {
  return normalizeMarketplaceDeliveryStatus(deliveryStatus);
}
