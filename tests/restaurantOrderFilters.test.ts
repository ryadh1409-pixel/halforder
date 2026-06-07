(global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;

import { isRestaurantOrderDelivered, matchesRestaurantOrderFilter } from '@/constants/restaurantOrderFilters';
import type { RestaurantOrder } from '@/services/orderService';

function stubOrder(partial: Partial<RestaurantOrder> & { id: string }): RestaurantOrder {
  return {
    restaurantId: 'r1',
    status: 'payment_confirmed',
    deliveryStatus: 'pending',
    paymentStatus: 'paid',
    totalPrice: 20,
    items: [],
    createdAtMs: Date.now() - 60_000,
    ...partial,
  } as RestaurantOrder;
}

describe('restaurantOrderFilters delivered tab', () => {
  it('includes completed orders when status or courier is terminal', () => {
    const order = stubOrder({
      id: 'o1',
      status: 'completed',
      deliveryStatus: 'delivered',
      completedAtMs: Date.now(),
    });
    expect(isRestaurantOrderDelivered(order)).toBe(true);
    expect(matchesRestaurantOrderFilter(order, 'delivered')).toBe(true);
  });

  it('does not treat timestamp-only rows as delivered', () => {
    const order = stubOrder({
      id: 'o2',
      status: 'payment_confirmed',
      deliveryStatus: 'driver_assigned',
      deliveredAtMs: Date.now(),
    });
    expect(isRestaurantOrderDelivered(order)).toBe(false);
  });
});
