import {
  resolveCustomerLifecycleAlertKey,
  resolveDriverActiveLifecycleAlertKey,
  resolveRestaurantLifecycleAlertKey,
} from '@/lib/orderLifecycleAlerts';

describe('orderLifecycleAlerts', () => {
  it('maps customer restaurant accepted to accepted alert', () => {
    expect(
      resolveCustomerLifecycleAlertKey({
        status: 'accepted',
        paymentStatus: 'paid',
        deliveryStatus: 'accepted',
      }),
    ).toBe('accepted');
  });

  it('maps customer preparing to preparing alert', () => {
    expect(
      resolveCustomerLifecycleAlertKey({
        status: 'preparing',
        paymentStatus: 'paid',
        deliveryStatus: 'preparing',
      }),
    ).toBe('preparing');
  });

  it('maps customer ready_for_pickup alert', () => {
    expect(
      resolveCustomerLifecycleAlertKey({
        status: 'ready_for_pickup',
        paymentStatus: 'paid',
        deliveryStatus: 'waiting_driver',
      }),
    ).toBe('ready_for_pickup');
  });

  it('maps restaurant awaiting restaurant to new paid order alert', () => {
    expect(
      resolveRestaurantLifecycleAlertKey({
        status: 'payment_confirmed',
        paymentStatus: 'paid',
        deliveryStatus: 'pending',
      }),
    ).toBe('new_paid_order');
  });

  it('maps restaurant driver assigned alert', () => {
    expect(
      resolveRestaurantLifecycleAlertKey({
        status: 'ready_for_pickup',
        paymentStatus: 'paid',
        deliveryStatus: 'driver_assigned',
        driverId: 'driver-1',
      }),
    ).toBe('driver_assigned');
  });

  it('maps driver ready_for_pickup alert', () => {
    expect(
      resolveDriverActiveLifecycleAlertKey({
        status: 'ready_for_pickup',
        paymentStatus: 'paid',
        deliveryStatus: 'ready_for_pickup',
        driverId: 'driver-1',
      }),
    ).toBe('ready_for_pickup');
  });

  it('maps driver picked up alert', () => {
    expect(
      resolveDriverActiveLifecycleAlertKey({
        status: 'picked_up',
        paymentStatus: 'paid',
        deliveryStatus: 'picked_up',
        driverId: 'driver-1',
      }),
    ).toBe('picked_up');
  });
});
