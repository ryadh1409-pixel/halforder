import { isOrderFresh, isOrderStale } from '@/lib/restaurantOrderFreshness';
import {
  isRestaurantActiveLiveOrder,
  RESTAURANT_KITCHEN_ACTIVE_STATUSES,
} from '@/lib/restaurantLiveOrders';
import type { RestaurantOrder } from '@/services/orderService';
import { deriveOrderStage } from '@/services/orderStage';

export type RestaurantOrderListFilter =
  | 'active'
  | 'ready'
  | 'driver_assigned'
  | 'delivered'
  | 'archived';

export const RESTAURANT_ORDER_FILTERS: ReadonlyArray<{
  id: RestaurantOrderListFilter;
  label: string;
}> = [
  { id: 'active', label: 'Active' },
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

  switch (filter) {
    case 'active':
      return isRestaurantActiveLiveOrder(order);
    case 'ready':
      return deriveOrderStage(order) === 'driver_assignment';
    case 'driver_assigned':
      return deriveOrderStage(order) === 'driver_assigned';
    case 'delivered':
      return isRestaurantOrderDelivered(order);
    default:
      return true;
  }
}

export function restaurantOrderFilterEmptyTitle(
  filter: RestaurantOrderListFilter,
): string {
  switch (filter) {
    case 'archived':
      return 'No archived orders';
    case 'ready':
      return 'No orders ready for pickup';
    case 'driver_assigned':
      return 'No driver-assigned orders';
    case 'delivered':
      return 'No delivered orders';
    default:
      return 'No active orders';
  }
}

/** @deprecated Use RESTAURANT_KITCHEN_ACTIVE_STATUSES */
export const KITCHEN_ACTIVE = RESTAURANT_KITCHEN_ACTIVE_STATUSES;
