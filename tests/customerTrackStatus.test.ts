import {
  customerTrackHeaderTitle,
  customerTrackStepIndex,
  customerTrackStepLabel,
  resolveCustomerTrackStep,
} from '@/lib/customerTrackStatus';

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
    expect(customerTrackHeaderTitle('delivered')).toBe('Delivered!');
  });

  it('uses furthest-forward signal between status and deliveryStatus', () => {
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
