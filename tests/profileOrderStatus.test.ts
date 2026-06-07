import { profileOrderStatusLabel } from '@/constants/profileOrders';

describe('profileOrderStatusLabel', () => {
  it('shows Driver at restaurant for ready_for_pickup when driver is assigned', () => {
    expect(
      profileOrderStatusLabel('ready_for_pickup', 'ready_for_pickup', 'paid', {
        driverId: 'driver-1',
        orderId: 'o1',
      }),
    ).toBe('Driver at restaurant');
  });

  it('shows Driver assigned for driver_assigned courier status', () => {
    expect(
      profileOrderStatusLabel('payment_confirmed', 'driver_assigned', 'paid', {
        driverId: 'driver-1',
      }),
    ).toBe('Driver assigned');
  });

  it('shows Finding Driver when kitchen ready and waiting for courier', () => {
    expect(profileOrderStatusLabel('ready_for_pickup', 'waiting_driver', 'paid')).toBe(
      'Finding Driver',
    );
  });
});
