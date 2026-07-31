import { isOrderCompleted } from '@/lib/orderCompletion';
import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import {
  isRestaurantActiveLiveOrder,
  isRestaurantPendingAcceptOrder,
  RESTAURANT_KITCHEN_ACTIVE_STATUSES,
} from '@/lib/restaurantLiveOrders';
import type { RestaurantOrder } from '@/services/orderService';
import { deriveOrderStage } from '@/services/orderStage';

export type RestaurantOrderListFilter =
  | 'new'
  | 'preparing'
  | 'ready'
  | 'driver_assigned'
  | 'delivered'
  | 'cancelled'
  | 'archived';

/** Active kitchen sections (Orders → Active Orders). */
export const RESTAURANT_ACTIVE_ORDER_FILTERS: ReadonlyArray<{
  id: RestaurantOrderListFilter;
  label: string;
}> = [
  { id: 'new', label: 'New Orders' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'driver_assigned', label: 'With Driver' },
] as const;

/** @deprecated Prefer RESTAURANT_ACTIVE_ORDER_FILTERS + archived history mode. */
export const RESTAURANT_ORDER_FILTERS: ReadonlyArray<{
  id: RestaurantOrderListFilter;
  label: string;
}> = [
  ...RESTAURANT_ACTIVE_ORDER_FILTERS,
  { id: 'delivered', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'archived', label: 'Archive' },
] as const;

export {
  isRestaurantActiveLiveOrder,
  isRestaurantPaidOrder,
  isRestaurantPrePaymentCheckout,
  RESTAURANT_KITCHEN_ACTIVE_STATUSES,
} from '@/lib/restaurantLiveOrders';

export function isRestaurantOrderArchived(o: RestaurantOrder): boolean {
  return o.archivedByRestaurant === true || o.hiddenForRestaurant === true;
}

function normStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Delivered tab — `status=completed` OR `deliveryStatus=delivered` only. */
export function isRestaurantOrderDelivered(order: RestaurantOrder): boolean {
  return isOrderCompleted(order);
}

export function isRestaurantOrderCancelled(order: RestaurantOrder): boolean {
  const status = normStatus(order.status);
  const courier = normStatus(order.deliveryStatus);
  return status === 'cancelled' || status === 'rejected' || courier === 'cancelled';
}

export function isRestaurantOrderTerminalForArchive(order: RestaurantOrder): boolean {
  return isRestaurantOrderDelivered(order) || isRestaurantOrderCancelled(order);
}

export function matchesRestaurantOrderFilter(
  order: RestaurantOrder,
  filter: RestaurantOrderListFilter,
): boolean {
  const archived = isRestaurantOrderArchived(order);

  if (filter === 'archived') {
    if (archived) return true;
    // Completed + cancelled automatically appear in Order History / Archive.
    return isRestaurantOrderTerminalForArchive(order);
  }

  if (archived) return false;

  const stage = deriveOrderStage(order);

  switch (filter) {
    case 'new':
      if (!isOrderFresh(order)) return false;
      return isRestaurantPendingAcceptOrder(order) || stage === 'awaiting_restaurant';
    case 'preparing':
      if (!isOrderFresh(order)) return false;
      return stage === 'preparing';
    case 'ready':
      if (!isOrderFresh(order)) return false;
      return stage === 'driver_assignment';
    case 'driver_assigned':
      if (!isOrderFresh(order)) return false;
      return stage === 'driver_assigned' || stage === 'picked_up';
    case 'delivered':
      return isRestaurantOrderDelivered(order) && !isRestaurantOrderCancelled(order);
    case 'cancelled':
      return isRestaurantOrderCancelled(order);
    default:
      return isRestaurantActiveLiveOrder(order);
  }
}

export function restaurantOrderFilterEmptyTitle(
  filter: RestaurantOrderListFilter,
): string {
  switch (filter) {
    case 'archived':
      return 'No orders in archive';
    case 'new':
      return 'No new orders';
    case 'preparing':
      return 'Nothing preparing right now';
    case 'ready':
      return 'No orders ready for pickup';
    case 'driver_assigned':
      return 'No orders with a driver';
    case 'delivered':
      return 'No completed orders';
    case 'cancelled':
      return 'No cancelled orders';
    default:
      return 'No orders';
  }
}

/** @deprecated Use RESTAURANT_KITCHEN_ACTIVE_STATUSES */
export const KITCHEN_ACTIVE = RESTAURANT_KITCHEN_ACTIVE_STATUSES;
