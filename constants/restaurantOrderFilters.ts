import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import {
  isRestaurantActiveLiveOrder,
  RESTAURANT_KITCHEN_ACTIVE_STATUSES,
} from '@/lib/restaurantLiveOrders';
import type { RestaurantOrder } from '@/services/orderService';

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

export function matchesRestaurantOrderFilter(
  order: RestaurantOrder,
  filter: RestaurantOrderListFilter,
): boolean {
  if (!isOrderFresh(order)) return false;

  const archived = isRestaurantOrderArchived(order);

  if (filter === 'archived') {
    return archived;
  }
  if (archived) return false;

  switch (filter) {
    case 'active':
      return isRestaurantActiveLiveOrder(order);
    case 'ready':
      return order.status === 'ready' || order.status === 'ready_for_pickup';
    case 'driver_assigned':
      return (
        typeof order.driverId === 'string' &&
        order.driverId.length > 0 &&
        order.status !== 'delivered' &&
        order.status !== 'cancelled' &&
        order.status !== 'rejected'
      );
    case 'delivered':
      return order.status === 'delivered';
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
