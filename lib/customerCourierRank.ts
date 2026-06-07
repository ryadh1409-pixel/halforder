import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';

/**
 * Customer courier progression rank — never downgrade along this chain.
 * driver_assigned=1 → ready_for_pickup=2 → picked_up=3 → delivered=4
 */
export const CUSTOMER_COURIER_RANK = {
  NONE: 0,
  DRIVER_ASSIGNED: 1,
  READY_FOR_PICKUP: 2,
  PICKED_UP: 3,
  DELIVERED: 4,
} as const;

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasDriver(raw: { driverId?: unknown; assignedDriverId?: unknown }): boolean {
  const id = raw.driverId ?? raw.assignedDriverId;
  return typeof id === 'string' && id.trim().length > 0;
}

/** Monotonic courier rank from live Firestore fields (timestamps ignored). */
export function resolveCustomerCourierRank(
  raw: { status?: unknown; deliveryStatus?: unknown; driverId?: unknown; assignedDriverId?: unknown },
): number {
  if (isOrderCompleted(raw)) {
    return CUSTOMER_COURIER_RANK.DELIVERED;
  }

  const status = norm(raw.status);
  if (status === 'completed' || status === 'delivered') {
    return CUSTOMER_COURIER_RANK.DELIVERED;
  }
  if (status === 'picked_up' || status === 'on_the_way' || status === 'arrived_customer') {
    return CUSTOMER_COURIER_RANK.PICKED_UP;
  }

  const courier = normalizeMarketplaceDeliveryStatus(raw.deliveryStatus);
  if (courier === MARKETPLACE_DELIVERY_STATUS.DELIVERED) {
    return CUSTOMER_COURIER_RANK.DELIVERED;
  }
  if (courier === MARKETPLACE_DELIVERY_STATUS.PICKED_UP) {
    return CUSTOMER_COURIER_RANK.PICKED_UP;
  }
  if (courier === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP) {
    return CUSTOMER_COURIER_RANK.READY_FOR_PICKUP;
  }
  if (courier === MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED) {
    return CUSTOMER_COURIER_RANK.DRIVER_ASSIGNED;
  }

  if (hasDriver(raw)) {
    return CUSTOMER_COURIER_RANK.DRIVER_ASSIGNED;
  }

  return CUSTOMER_COURIER_RANK.NONE;
}

export function isCustomerCourierRankRegression(
  previousRank: number,
  nextRank: number,
): boolean {
  return nextRank < previousRank;
}
