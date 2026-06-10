import { isOrderTerminalForAssignment } from '@/lib/terminalOrderAssignment';

describe('isOrderTerminalForAssignment', () => {
  it('blocks claim when status is completed', () => {
    expect(
      isOrderTerminalForAssignment({
        status: 'completed',
        deliveryStatus: 'delivered',
      }),
    ).toBe(true);
  });

  it('blocks claim when earningsRecorded', () => {
    expect(
      isOrderTerminalForAssignment({
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        earningsRecorded: true,
      }),
    ).toBe(true);
  });

  it('allows active driver_assigned assignment state', () => {
    expect(
      isOrderTerminalForAssignment({
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        driverId: 'drv1',
      }),
    ).toBe(false);
  });
});
