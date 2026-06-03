import { ORDER_STATUS } from '@/constants/orderStatus';
import type { OrderStatus } from '@/services/orderService';

/** Post-payment kitchen status (Stripe webhook target). */
export const RESTAURANT_CONFIRMED_STATUS = ORDER_STATUS.PAYMENT_CONFIRMED;

export type RestaurantOrderVisibilityInput = {
  status?: OrderStatus | string;
  paymentStatus?: string;
  createdAtMs?: number | null;
  createdAt?: unknown;
  archivedByRestaurant?: boolean;
  hiddenForRestaurant?: boolean;
};

export function isRestaurantPaidOrder(order: RestaurantOrderVisibilityInput): boolean {
  const ps =
    typeof order.paymentStatus === 'string'
      ? order.paymentStatus.trim().toLowerCase()
      : '';
  return ps === 'paid';
}

/**
 * Marketplace kitchen feed: only paid orders (or in-flight kitchen statuses).
 * Hides unpaid `awaiting_payment` snapshots that cause accept/badge flicker.
 */
export function isRestaurantMarketplaceKitchenOrder(
  order: RestaurantOrderVisibilityInput,
): boolean {
  if (isRestaurantPaidOrder(order)) return true;

  const status = typeof order.status === 'string' ? order.status.trim().toLowerCase() : '';
  if (status === 'awaiting_payment' || status === 'payment_processing') {
    return false;
  }

  return RESTAURANT_KITCHEN_ACTIVE_STATUSES.has(status as OrderStatus);
}

/** Statuses the restaurant kitchen should never see before payment settles. */
export const RESTAURANT_PRE_PAYMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'awaiting_payment',
  'payment_processing',
]);

/** In-flight kitchen + delivery statuses for the Active tab. */
export const RESTAURANT_KITCHEN_ACTIVE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  RESTAURANT_CONFIRMED_STATUS as OrderStatus,
  'pending',
  'accepted',
  'restaurant_accepted',
  'preparing',
  'ready',
  'ready_for_pickup',
  'pending_driver',
  'driver_accepted',
  'driver_assigned',
  'arriving_restaurant',
  'picked_up_pending',
  'picked_up',
  'on_the_way',
  'arrived_customer',
]);

export function isRestaurantPrePaymentCheckout(order: RestaurantOrderVisibilityInput): boolean {
  const status = typeof order.status === 'string' ? order.status : '';
  return (
    !isRestaurantPaidOrder(order) &&
    RESTAURANT_PRE_PAYMENT_STATUSES.has(status as OrderStatus)
  );
}

/**
 * Paid orders are live for the restaurant immediately (including brief split-state
 * `awaiting_payment` + paid until webhook/repair advances status).
 * Caller should enforce the 24h freshness window separately.
 */
export function isRestaurantActiveLiveOrder(order: RestaurantOrderVisibilityInput): boolean {
  const status = typeof order.status === 'string' ? order.status : '';
  if (isRestaurantPrePaymentCheckout(order)) return false;
  if (status === 'delivered' || status === 'cancelled' || status === 'rejected') {
    return false;
  }
  return isRestaurantPaidOrder(order);
}

/** Pending tab: paid, awaiting restaurant accept (not yet preparing). */
export function isRestaurantPendingAcceptOrder(order: RestaurantOrderVisibilityInput): boolean {
  if (!isRestaurantPaidOrder(order)) return false;
  const status = typeof order.status === 'string' ? order.status.trim().toLowerCase() : '';
  return (
    status === 'awaiting_payment' ||
    status === 'pending' ||
    status === 'payment_confirmed' ||
    status === 'pending_driver'
  );
}

export function isRestaurantPendingKitchenOrder(order: RestaurantOrderVisibilityInput): boolean {
  const status = typeof order.status === 'string' ? order.status : '';
  return (
    status === 'pending' ||
    status === RESTAURANT_CONFIRMED_STATUS ||
    status === 'pending_driver' ||
    status === 'awaiting_payment'
  );
}
