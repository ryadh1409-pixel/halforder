import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
  type MarketplaceDeliveryStatus,
} from '@/lib/orderStatus';

/** Full marketplace order lifecycle (kitchen + courier). */
export const MARKETPLACE_ORDER_LIFECYCLE = [
  'payment_confirmed',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'driver_assigned',
  'picked_up',
  'delivered',
] as const;

export type MarketplaceLifecycleStatus = (typeof MARKETPLACE_ORDER_LIFECYCLE)[number];

const LIFECYCLE_RANK: Record<MarketplaceLifecycleStatus, number> = {
  payment_confirmed: 10,
  accepted: 20,
  preparing: 30,
  ready_for_pickup: 40,
  driver_assigned: 50,
  picked_up: 60,
  delivered: 70,
};

/** Forward-only driver fulfillment transitions (courier field). */
export const DRIVER_FULFILLMENT_TRANSITIONS: Partial<
  Record<MarketplaceDeliveryStatus, MarketplaceDeliveryStatus[]>
> = {
  [MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED]: [
    MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
    MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
  ],
  [MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP]: [MARKETPLACE_DELIVERY_STATUS.PICKED_UP],
  [MARKETPLACE_DELIVERY_STATUS.PICKED_UP]: [MARKETPLACE_DELIVERY_STATUS.DELIVERED],
};

export function marketplaceLifecycleRank(status: unknown): number {
  const normalized = normalizeMarketplaceDeliveryStatus(status);
  if (normalized === MARKETPLACE_DELIVERY_STATUS.DELIVERED) return LIFECYCLE_RANK.delivered;
  if (normalized === MARKETPLACE_DELIVERY_STATUS.PICKED_UP) return LIFECYCLE_RANK.picked_up;
  if (normalized === MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED) return LIFECYCLE_RANK.driver_assigned;
  if (normalized === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP) return LIFECYCLE_RANK.ready_for_pickup;

  const raw = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (raw in LIFECYCLE_RANK) return LIFECYCLE_RANK[raw as MarketplaceLifecycleStatus];
  return 0;
}

export function isForwardLifecycleTransition(fromStatus: unknown, toStatus: unknown): boolean {
  const fromRank = marketplaceLifecycleRank(fromStatus);
  const toRank = marketplaceLifecycleRank(toStatus);
  if (fromRank === 0 || toRank === 0) return false;
  return toRank > fromRank;
}

export function isLegalDriverFulfillmentTransition(
  fromCourier: unknown,
  toCourier: unknown,
): boolean {
  const from = normalizeMarketplaceDeliveryStatus(fromCourier);
  const allowed = DRIVER_FULFILLMENT_TRANSITIONS[from];
  if (!allowed?.length) return false;
  const to = normalizeMarketplaceDeliveryStatus(toCourier);
  return allowed.includes(to);
}

export function isLegalDriverFulfillmentAction(
  currentCourier: unknown,
  action: 'arrive_restaurant' | 'pickup' | 'deliver',
): boolean {
  const from = normalizeMarketplaceDeliveryStatus(currentCourier);
  if (action === 'arrive_restaurant') {
    return isLegalDriverFulfillmentTransition(from, MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP);
  }
  if (action === 'pickup') {
    return isLegalDriverFulfillmentTransition(from, MARKETPLACE_DELIVERY_STATUS.PICKED_UP);
  }
  return isLegalDriverFulfillmentTransition(from, MARKETPLACE_DELIVERY_STATUS.DELIVERED);
}
