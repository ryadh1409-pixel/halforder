import { areRestaurantOrderListsEqual } from '@/lib/restaurantOrderListDedup';
import type { RestaurantOrder } from '@/services/orderService';

function stubOrder(partial: Partial<RestaurantOrder> & { id: string }): RestaurantOrder {
  const base: RestaurantOrder = {
    id: 'stub',
    userId: '',
    customerName: null,
    customerPhone: null,
    restaurantId: 'r1',
    items: [],
    subtotal: 0,
    tax: 0,
    deliveryFee: 0,
    totalPrice: 0,
    status: 'accepted',
    paymentStatus: 'paid',
    deliveryStatus: 'accepted',
    stripePaymentIntentId: null,
    paymentIntentId: null,
    checkoutSessionId: null,
    driverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    groupId: null,
    estimatedDeliveryTime: 0,
    deliveryLocation: null,
    customerLocation: null,
    userLocation: null,
    restaurantLocation: null,
    driverLocation: null,
    notes: null,
    createdAtLabel: '',
    createdAtMs: 1,
    archivedByRestaurant: false,
    hiddenForRestaurant: false,
    archivedAtMs: null,
    hiddenAtMs: null,
    restoredAtMs: null,
    restaurant: { id: 'r1', name: '', image: null, address: null, latitude: null, longitude: null },
    customer: { id: '', name: '', avatar: null, address: null },
    driver: null,
    acceptedAtMs: null,
    pickedUpAtMs: null,
    deliveredAtMs: null,
    cancelledAtMs: null,
    updatedAtMs: 100,
    deliveryPin: null,
    routePolyline: null,
  };
  return { ...base, ...partial };
}

describe('areRestaurantOrderListsEqual', () => {
  it('returns true when status/delivery/updatedAt are unchanged', () => {
    const a = [stubOrder({ id: 'a', status: 'preparing', updatedAtMs: 200 })];
    const b = [stubOrder({ id: 'a', status: 'preparing', updatedAtMs: 200 })];
    expect(areRestaurantOrderListsEqual(a, b)).toBe(true);
  });

  it('returns false when updatedAt advances', () => {
    const a = [stubOrder({ id: 'a', updatedAtMs: 100 })];
    const b = [stubOrder({ id: 'a', updatedAtMs: 200 })];
    expect(areRestaurantOrderListsEqual(a, b)).toBe(false);
  });
});
