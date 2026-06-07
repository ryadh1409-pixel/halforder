import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import type { OrderStageInput } from '@/services/orderStage';

/**
 * Canonical customer courier delivery stages (Firestore-agnostic).
 * Driver workflow writes `ready_for_pickup` for "arrived at restaurant" —
 * customers always see `driver_at_restaurant`.
 */
export const CUSTOMER_DELIVERY_STAGE = {
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_AT_RESTAURANT: 'driver_at_restaurant',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
} as const;

export type CustomerDeliveryStage =
  (typeof CUSTOMER_DELIVERY_STAGE)[keyof typeof CUSTOMER_DELIVERY_STAGE];

/** Raw courier values that map to {@link CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT}. */
export const DRIVER_AT_RESTAURANT_ALIASES = [
  'ready_for_pickup',
  'driver_at_restaurant',
  'arrived_restaurant',
  'arriving_restaurant',
] as const;

const DRIVER_AT_RESTAURANT_ALIAS_SET = new Set<string>(DRIVER_AT_RESTAURANT_ALIASES);

const LEGACY_COURIER_TO_CUSTOMER: Record<string, CustomerDeliveryStage> = {
  driver_assigned: CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED,
  driver_accepted: CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED,
  heading_to_restaurant: CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED,
  driver_on_way: CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED,
  ready_for_pickup: CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT,
  driver_at_restaurant: CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT,
  arrived_restaurant: CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT,
  arriving_restaurant: CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT,
  picked_up: CUSTOMER_DELIVERY_STAGE.PICKED_UP,
  on_the_way: CUSTOMER_DELIVERY_STAGE.PICKED_UP,
  near_customer: CUSTOMER_DELIVERY_STAGE.PICKED_UP,
  heading_to_customer: CUSTOMER_DELIVERY_STAGE.PICKED_UP,
  arrived_customer: CUSTOMER_DELIVERY_STAGE.PICKED_UP,
  delivered: CUSTOMER_DELIVERY_STAGE.DELIVERED,
  completed: CUSTOMER_DELIVERY_STAGE.DELIVERED,
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasDriver(order: OrderStageInput): boolean {
  const id = order.driverId ?? order.assignedDriverId;
  return typeof id === 'string' && id.trim().length > 0;
}

function isDriverAtRestaurantRaw(raw: string, normalized: string, order: OrderStageInput): boolean {
  if (!hasDriver(order)) return false;
  if (DRIVER_AT_RESTAURANT_ALIAS_SET.has(raw)) return true;
  return normalized === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP;
}

/**
 * Resolves canonical customer courier stage from live Firestore fields.
 * Returns `null` when the order is still in kitchen/payment phases (no courier stage yet).
 */
export function resolveCustomerDeliveryStage(
  order: OrderStageInput | null | undefined,
): CustomerDeliveryStage | null {
  if (!order) return null;
  if (isOrderCompleted(order)) return CUSTOMER_DELIVERY_STAGE.DELIVERED;

  const status = norm(order.status);
  if (status === 'completed' || status === 'delivered') {
    return CUSTOMER_DELIVERY_STAGE.DELIVERED;
  }
  if (status === 'picked_up' || status === 'on_the_way' || status === 'arrived_customer') {
    return CUSTOMER_DELIVERY_STAGE.PICKED_UP;
  }

  const raw = norm(order.deliveryStatus);
  const normalized = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);

  if (normalized === MARKETPLACE_DELIVERY_STATUS.DELIVERED || raw === 'completed') {
    return CUSTOMER_DELIVERY_STAGE.DELIVERED;
  }
  if (normalized === MARKETPLACE_DELIVERY_STATUS.PICKED_UP) {
    return CUSTOMER_DELIVERY_STAGE.PICKED_UP;
  }
  if (isDriverAtRestaurantRaw(raw, normalized, order)) {
    return CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT;
  }
  if (
    normalized === MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED ||
    raw === 'heading_to_restaurant' ||
    (hasDriver(order) && raw === 'driver_assigned')
  ) {
    return CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED;
  }

  const mapped = LEGACY_COURIER_TO_CUSTOMER[raw];
  if (mapped && hasDriver(order)) return mapped;

  return hasDriver(order) ? CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED : null;
}

export function customerDeliveryStageLabel(stage: CustomerDeliveryStage): string {
  switch (stage) {
    case CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED:
      return 'Driver assigned';
    case CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT:
      return 'Driver at restaurant';
    case CUSTOMER_DELIVERY_STAGE.PICKED_UP:
      return 'Picked up';
    case CUSTOMER_DELIVERY_STAGE.DELIVERED:
      return 'Delivered';
    default:
      return 'Order update';
  }
}

export function customerDeliveryStageRank(stage: CustomerDeliveryStage): number {
  switch (stage) {
    case CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED:
      return 1;
    case CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT:
      return 2;
    case CUSTOMER_DELIVERY_STAGE.PICKED_UP:
      return 3;
    case CUSTOMER_DELIVERY_STAGE.DELIVERED:
      return 4;
    default:
      return 0;
  }
}

/** Mandatory log when customer-facing code resolves courier delivery stage. */
export function logCustomerStatusResolve(
  orderId: string,
  rawDeliveryStatus: unknown,
  resolvedDeliveryStage: CustomerDeliveryStage | string | null,
  meta?: { trackStep?: string | null },
): void {
  console.log('[CUSTOMER STATUS RESOLVE]', {
    orderId,
    rawDeliveryStatus: rawDeliveryStatus ?? null,
    resolvedDeliveryStage: resolvedDeliveryStage ?? null,
    trackStep: meta?.trackStep ?? null,
    timestamp: Date.now(),
  });
}
