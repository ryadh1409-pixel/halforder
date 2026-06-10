import {
  isDriverActiveListTerminal,
  isRawDriverActiveTerminal,
} from '@/lib/driverActiveOrderFilter';

describe('isDriverActiveListTerminal', () => {
  it('excludes completed and delivered status fields', () => {
    expect(
      isDriverActiveListTerminal({
        status: 'completed',
        deliveryStatus: 'driver_assigned',
      }),
    ).toBe(true);
    expect(
      isDriverActiveListTerminal({
        status: 'payment_confirmed',
        deliveryStatus: 'delivered',
      }),
    ).toBe(true);
  });

  it('excludes cancelled status fields', () => {
    expect(
      isDriverActiveListTerminal({
        status: 'cancelled',
        deliveryStatus: 'driver_assigned',
      }),
    ).toBe(true);
    expect(
      isDriverActiveListTerminal({
        status: 'payment_confirmed',
        deliveryStatus: 'cancelled',
      }),
    ).toBe(true);
  });

  it('excludes persisted fulfillment flags without relying on session memory', () => {
    expect(
      isDriverActiveListTerminal({
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        marketplaceArchived: true,
        earningsRecorded: true,
      }),
    ).toBe(true);
  });

  it('isRawDriverActiveTerminal delegates to the shared gate', () => {
    expect(
      isRawDriverActiveTerminal({
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        earningsRecorded: true,
      }),
    ).toBe(true);
  });
});
