import { isOrderFresh, isOrderStale } from '@/lib/restaurantOrderFreshness';
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
  | 'archived';

export const RESTAURANT_ORDER_FILTERS: ReadonlyArray<{
  id: RestaurantOrderListFilter;
  label: string;
}> = [
  { id: 'new', label: 'New' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'driver_assigned', label: 'Driver' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'archived', label: 'Archived' },
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

/** Delivered/completed within the restaurant dashboard window. */
export function isRestaurantOrderDelivered(order: RestaurantOrder): boolean {
  const status = normStatus(order.status);
  const courier = normStatus(order.deliveryStatus);
  return status === 'delivered' || status === 'completed' || courier === 'delivered';
}

function isRestaurantOrderCancelled(order: RestaurantOrder): boolean {
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
    if (!isRestaurantOrderTerminalForArchive(order)) return false;
    return isOrderStale(order);
  }

  if (archived) return false;
  if (!isOrderFresh(order)) return false;

  const stage = deriveOrderStage(order);

  switch (filter) {
    case 'new':
      return isRestaurantPendingAcceptOrder(order) || stage === 'awaiting_restaurant';
    case 'preparing':
      return stage === 'preparing';
    case 'ready':
      return stage === 'driver_assignment';
    case 'driver_assigned':
      return stage === 'driver_assigned' || stage === 'picked_up';
    case 'delivered':
      return isRestaurantOrderDelivered(order);
    default:
      return isRestaurantActiveLiveOrder(order);
  }
}

export function restaurantOrderFilterEmptyTitle(
  filter: RestaurantOrderListFilter,
): string {
  switch (filter) {
    case 'archived':
      return 'No archived orders';
    case 'new':
      return 'No new orders';
    case 'preparing':
      return 'Nothing preparing right now';
    case 'ready':
      return 'No orders ready for pickup';
    case 'driver_assigned':
      return 'No driver-assigned orders';
    case 'delivered':
      return 'No delivered orders';
    default:
      return 'No orders';
  }
}

/** @deprecated Use RESTAURANT_KITCHEN_ACTIVE_STATUSES */
export const KITCHEN_ACTIVE = RESTAURANT_KITCHEN_ACTIVE_STATUSES;
