import { resolveMarketplaceOrderViewerRole } from '@/services/orderViewerRole';
import type { RestaurantOrder } from '@/services/orderService';

function baseOrder(overrides: Partial<RestaurantOrder> = {}): RestaurantOrder {
  return {
    id: 'o1',
    userId: 'customer-1',
    customerName: null,
    customerPhone: null,
    restaurantId: 'rest-1',
    items: [{ id: '1', name: 'Burger', price: 10, qty: 1, image: null }],
    subtotal: 10,
    tax: 1,
    deliveryFee: 2,
    totalPrice: 13,
    status: 'payment_confirmed',
    paymentStatus: 'paid',
    deliveryStatus: 'pending',
    stripePaymentIntentId: null,
    paymentIntentId: null,
    checkoutSessionId: null,
    driverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    groupId: null,
    estimatedDeliveryTime: 30,
    deliveryLocation: { lat: 1, lng: 2, address: '123 Main' },
    customerLocation: null,
    userLocation: null,
    restaurantLocation: null,
    driverLocation: null,
    notes: null,
    createdAtLabel: '',
    createdAtMs: null,
    archivedByRestaurant: false,
    hiddenForRestaurant: false,
    archivedAtMs: null,
    hiddenAtMs: null,
    restoredAtMs: null,
    restaurant: { id: 'rest-1', name: 'Cafe', image: null, address: null, latitude: null, longitude: null },
    customer: { id: 'customer-1', name: 'Pat', avatar: null, address: null },
    driver: null,
    acceptedAtMs: null,
    preparedAtMs: null,
    readyAtMs: null,
    pickedUpAtMs: null,
    deliveredAtMs: null,
    cancelledAtMs: null,
    updatedAtMs: null,
    deliveryPin: null,
    routePolyline: null,
    deliveryType: 'delivery',
    deliveryAddress: '123 Main',
    ...overrides,
  };
}

describe('resolveMarketplaceOrderViewerRole', () => {
  it('treats order owner as customer even when account role is driver', () => {
    const role = resolveMarketplaceOrderViewerRole(
      baseOrder({ userId: 'customer-1', customer: { id: 'customer-1', name: 'Pat', avatar: null, address: null } }),
      'customer-1',
      'driver',
    );
    expect(role).toBe('customer');
  });

  it('treats assigned driver as driver', () => {
    const role = resolveMarketplaceOrderViewerRole(
      baseOrder({ driverId: 'driver-9' }),
      'driver-9',
      'driver',
    );
    expect(role).toBe('driver');
  });
});
