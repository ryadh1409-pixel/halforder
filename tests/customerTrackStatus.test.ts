import {
  customerTrackHeaderTitle,
  customerTrackStepIndex,
  customerTrackStepLabel,
  resolveCustomerTrackStep,
} from '@/lib/customerTrackStatus';
import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';

describe('normalizeMarketplaceDeliveryStatus', () => {
  it('preserves preparing (does not map to pending)', () => {
    expect(normalizeMarketplaceDeliveryStatus('preparing')).toBe(
      MARKETPLACE_DELIVERY_STATUS.PREPARING,
    );
  });
});

describe('resolveCustomerTrackStep', () => {
  it('maps payment_confirmed to order_placed', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
      }),
    ).toBe('order_placed');
    expect(customerTrackHeaderTitle('order_placed')).toBe('Restaurant reviewing your order');
    expect(customerTrackStepIndex('order_placed')).toBe(0);
  });

  it('maps restaurant_accepted from status', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'restaurant_accepted',
        deliveryStatus: 'accepted',
      }),
    ).toBe('restaurant_accepted');
    expect(customerTrackHeaderTitle('restaurant_accepted')).toBe(
      'Restaurant is preparing your order',
    );
  });

  it('maps preparing from status', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'preparing',
        deliveryStatus: 'preparing',
      }),
    ).toBe('preparing');
  });

  it('maps ready_for_pickup from kitchen status', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
      }),
    ).toBe('ready_for_pickup');
    expect(customerTrackHeaderTitle('ready_for_pickup')).toBe(
      'Ready for pickup - Driver on the way',
    );
  });

  it('maps awaiting_driver courier alias to ready_for_pickup', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'awaiting_driver',
      }),
    ).toBe('ready_for_pickup');
  });

  it('maps waiting_driver courier to ready_for_pickup', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'waiting_driver',
      }),
    ).toBe('ready_for_pickup');
  });

  it('maps driver_assigned when driver is set', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'driver_assigned',
        driverId: 'driver-1',
      }),
    ).toBe('driver_assigned');
    expect(customerTrackHeaderTitle('driver_assigned')).toBe('Driver heading to restaurant');
  });

  it('maps at_restaurant when assigned driver and courier ready_for_pickup', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
        driverId: 'driver-1',
      }),
    ).toBe('at_restaurant');
    expect(customerTrackHeaderTitle('at_restaurant')).toBe('Driver at restaurant');
  });

  it('maps picked_up and delivered', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'picked_up',
        deliveryStatus: 'picked_up',
        driverId: 'driver-1',
      }),
    ).toBe('picked_up');
    expect(customerTrackHeaderTitle('picked_up')).toBe('Driver heading to you');
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'delivered',
        deliveryStatus: 'delivered',
        driverId: 'driver-1',
      }),
    ).toBe('delivered');
    expect(customerTrackHeaderTitle('delivered')).toBe('Your order has been delivered! 🎉');
  });

  it('advances to picked_up when only deliveryStatus is picked_up (driver pickup patch)', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'picked_up',
        driverId: 'driver-1',
      }),
    ).toBe('picked_up');
  });

  it('advances to picked_up from pickedUpAtMs when courier field lags', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'driver_assigned',
        deliveryStatus: 'driver_assigned',
        driverId: 'driver-1',
        pickedUpAtMs: Date.now(),
      }),
    ).toBe('picked_up');
  });

  it('does not advance to delivered from timestamp alone (SSOT: status or courier)', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'driver_assigned',
        deliveryStatus: 'driver_assigned',
        driverId: 'driver-1',
        completedAtMs: Date.now(),
      }),
    ).toBe('driver_assigned');
  });

  it('maps completed status and delivered courier to delivered', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'completed',
        deliveryStatus: 'delivered',
        driverId: 'driver-1',
      }),
    ).toBe('delivered');
  });

  it('does not drop picked_up when driverId is set', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'driver_assigned',
        deliveryStatus: 'picked_up',
        driverId: 'driver-1',
      }),
    ).toBe('picked_up');
  });

  it('reaches delivered when deliveryStatus is delivered while status stays payment_confirmed', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'delivered',
        driverId: 'driver-1',
      }),
    ).toBe('delivered');
    expect(customerTrackHeaderTitle('delivered')).toBe('Your order has been delivered! 🎉');
  });

  it('uses furthest-forward signal from deliveryStatus not kitchen status', () => {
    expect(
      resolveCustomerTrackStep({
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'preparing',
      }),
    ).toBe('preparing');
    expect(customerTrackStepLabel('preparing')).toBe('Preparing');
  });
});
