import {
  ACTIVE_RESTAURANT_DERIVED_STAGES,
  isActiveRestaurantDerivedStage,
  isActiveRestaurantOrder,
} from '@/lib/restaurantActiveOrders';

describe('restaurantActiveOrdersQuery', () => {
  it('active derived stages match kitchen live feed', () => {
    expect(ACTIVE_RESTAURANT_DERIVED_STAGES).toEqual([
      'awaiting_restaurant',
      'preparing',
      'driver_assignment',
      'driver_assigned',
      'picked_up',
    ]);
  });

  it('excludes delivered and cancelled orders', () => {
    expect(
      isActiveRestaurantOrder({
        status: 'delivered',
        paymentStatus: 'paid',
        deliveryStatus: 'delivered',
      }),
    ).toBe(false);
    expect(
      isActiveRestaurantOrder({
        status: 'completed',
        paymentStatus: 'paid',
        deliveryStatus: 'picked_up',
      }),
    ).toBe(false);
    expect(
      isActiveRestaurantOrder({
        status: 'cancelled',
        paymentStatus: 'paid',
        deliveryStatus: 'cancelled',
      }),
    ).toBe(false);
    expect(
      isActiveRestaurantOrder({
        status: 'rejected',
        paymentStatus: 'paid',
        deliveryStatus: 'cancelled',
      }),
    ).toBe(false);
  });

  it('includes paid awaiting restaurant and preparing kitchen work', () => {
    expect(
      isActiveRestaurantOrder({
        status: 'payment_confirmed',
        paymentStatus: 'paid',
        deliveryStatus: 'pending',
      }),
    ).toBe(true);
    expect(
      isActiveRestaurantOrder({
        status: 'accepted',
        paymentStatus: 'paid',
        deliveryStatus: 'accepted',
      }),
    ).toBe(true);
    expect(
      isActiveRestaurantOrder({
        status: 'ready_for_pickup',
        paymentStatus: 'paid',
        deliveryStatus: 'ready_for_pickup',
      }),
    ).toBe(true);
  });

  it('excludes archived and awaiting payment', () => {
    expect(
      isActiveRestaurantOrder({
        status: 'payment_confirmed',
        paymentStatus: 'paid',
        archivedByRestaurant: true,
      }),
    ).toBe(false);
    expect(
      isActiveRestaurantOrder({
        status: 'awaiting_payment',
        paymentStatus: 'unpaid',
      }),
    ).toBe(false);
    expect(isActiveRestaurantDerivedStage('awaiting_payment')).toBe(false);
  });
});
