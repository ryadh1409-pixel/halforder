/**
 * Canonical marketplace delivery lifecycle (courier + driver pool).
 * Kitchen `status` on orders may differ; driver marketplace uses `deliveryStatus`.
 */

export const MARKETPLACE_DELIVERY_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  DRIVER_ASSIGNED: 'driver_assigned',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export type MarketplaceDeliveryStatus =
  (typeof MARKETPLACE_DELIVERY_STATUS)[keyof typeof MARKETPLACE_DELIVERY_STATUS];

/** Paid, unassigned orders visible on the driver marketplace. */
export const DRIVER_MARKETPLACE_VISIBLE_STATUSES: readonly MarketplaceDeliveryStatus[] = [
  MARKETPLACE_DELIVERY_STATUS.ACCEPTED,
  MARKETPLACE_DELIVERY_STATUS.PREPARING,
  MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
];

/** Terminal / post-claim — evict from marketplace pool. */
export const DRIVER_MARKETPLACE_REMOVED_STATUSES: readonly MarketplaceDeliveryStatus[] = [
  MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
  MARKETPLACE_DELIVERY_STATUS.DELIVERED,
  MARKETPLACE_DELIVERY_STATUS.CANCELLED,
];

const VISIBLE_SET = new Set<string>(DRIVER_MARKETPLACE_VISIBLE_STATUSES);
const REMOVED_SET = new Set<string>(DRIVER_MARKETPLACE_REMOVED_STATUSES);

/** Maps legacy Firestore values → canonical deliveryStatus. */
/** Raw Firestore courier statuses eligible for driver pool (checked before normalize). */
export const DRIVER_MARKETPLACE_RAW_VISIBLE = [
  'pending',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'waiting_driver',
  'ready',
  'accepted_for_delivery',
  'pending_driver',
] as const;

const RAW_VISIBLE_SET = new Set<string>(DRIVER_MARKETPLACE_RAW_VISIBLE);

/** Courier statuses that must stay visible even if timestamps are malformed. */
export const MARKETPLACE_READY_COURIER_RAW_STATUSES = [
  'ready_for_pickup',
  'waiting_driver',
  'accepted_for_delivery',
  'ready',
] as const;

const READY_COURIER_SET = new Set<string>(MARKETPLACE_READY_COURIER_RAW_STATUSES);

export function isMarketplaceReadyCourierStatus(deliveryStatus: unknown): boolean {
  const raw = typeof deliveryStatus === 'string' ? deliveryStatus.trim().toLowerCase() : '';
  if (READY_COURIER_SET.has(raw)) return true;
  const normalized = normalizeMarketplaceDeliveryStatus(deliveryStatus);
  return normalized === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP;
}

const LEGACY_DELIVERY_STATUS_MAP: Record<string, MarketplaceDeliveryStatus> = {
  waiting_driver: MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
  pending_driver: MARKETPLACE_DELIVERY_STATUS.ACCEPTED,
  ready: MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
  accepted_for_delivery: MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
  driver: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  driver_accepted: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  driver_assigned: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  heading_to_restaurant: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  arrived_restaurant: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  on_the_way: MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
  near_customer: MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
  rejected: MARKETPLACE_DELIVERY_STATUS.CANCELLED,
  completed: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
};

export function normalizeMarketplaceDeliveryStatus(
  raw: unknown,
): MarketplaceDeliveryStatus {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!v) return MARKETPLACE_DELIVERY_STATUS.PENDING;
  if (
    (Object.values(MARKETPLACE_DELIVERY_STATUS) as string[]).includes(v)
  ) {
    return v as MarketplaceDeliveryStatus;
  }
  const mapped = LEGACY_DELIVERY_STATUS_MAP[v];
  if (mapped) return mapped;
  return MARKETPLACE_DELIVERY_STATUS.PENDING;
}

export function isDriverMarketplaceVisible(
  deliveryStatus: unknown,
): boolean {
  const raw = typeof deliveryStatus === 'string' ? deliveryStatus.trim().toLowerCase() : '';
  if (RAW_VISIBLE_SET.has(raw)) return true;
  const normalized = normalizeMarketplaceDeliveryStatus(deliveryStatus);
  return VISIBLE_SET.has(normalized);
}

export function isDriverMarketplaceRemoved(
  deliveryStatus: unknown,
): boolean {
  const normalized = normalizeMarketplaceDeliveryStatus(deliveryStatus);
  return REMOVED_SET.has(normalized);
}

export function isDriverMarketplaceClaimable(
  deliveryStatus: unknown,
): boolean {
  return isDriverMarketplaceVisible(deliveryStatus);
}

export function isPaidMarketplaceDeliveryOrder(data: {
  paymentStatus?: unknown;
  deliveryType?: unknown;
}): boolean {
  const ps =
    typeof data.paymentStatus === 'string' ? data.paymentStatus.trim().toLowerCase() : '';
  return data.deliveryType === 'delivery' && ps === 'paid';
}

export function marketplaceDeliveryStatusLabel(
  deliveryStatus: unknown,
): string {
  switch (normalizeMarketplaceDeliveryStatus(deliveryStatus)) {
    case MARKETPLACE_DELIVERY_STATUS.PENDING:
      return 'Awaiting restaurant';
    case MARKETPLACE_DELIVERY_STATUS.ACCEPTED:
      return 'Restaurant accepted';
    case MARKETPLACE_DELIVERY_STATUS.PREPARING:
      return 'Preparing';
    case MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP:
      return 'Ready for pickup';
    case MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED:
      return 'Driver assigned';
    case MARKETPLACE_DELIVERY_STATUS.PICKED_UP:
      return 'Picked up';
    case MARKETPLACE_DELIVERY_STATUS.DELIVERED:
      return 'Delivered';
    case MARKETPLACE_DELIVERY_STATUS.CANCELLED:
      return 'Cancelled';
    default:
      return 'Order';
  }
}

/** @deprecated Use MARKETPLACE_DELIVERY_STATUS — kept for imports. */
export const DELIVERY_STATUS = MARKETPLACE_DELIVERY_STATUS;

export type DeliveryStatus = MarketplaceDeliveryStatus;

export function normalizeDeliveryStatus(value: unknown): MarketplaceDeliveryStatus {
  return normalizeMarketplaceDeliveryStatus(value);
}
