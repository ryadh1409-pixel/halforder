import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import type { OrderStatus, RestaurantOrder } from '@/services/orderService';

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

const KITCHEN_ACTIVE: ReadonlySet<OrderStatus> = new Set([
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
      return KITCHEN_ACTIVE.has(order.status);
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
