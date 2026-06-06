import {
  buildDriverEarningsStats,
  isDriverCompletedEarningsOrder,
  resolveDriverPayoutFromOrder,
} from '@/lib/driverEarnings';

describe('driver earnings aggregation', () => {
  it('includes status completed orders', () => {
    expect(
      isDriverCompletedEarningsOrder({
        status: 'completed',
        deliveryStatus: 'delivered',
      }),
    ).toBe(true);
  });

  it('sums persisted driverPayout values', () => {
    const stats = buildDriverEarningsStats([
      {
        id: 'o1',
        data: () => ({
          status: 'completed',
          deliveryStatus: 'delivered',
          earningsRecorded: true,
          driverPayout: 0.79,
        }),
      },
      {
        id: 'o2',
        data: () => ({
          status: 'completed',
          deliveryStatus: 'delivered',
          earningsRecorded: true,
          driverPayout: 1.2,
        }),
      },
    ]);
    expect(stats.deliveries).toBe(2);
    expect(stats.earnings).toBe(1.99);
    expect(stats.platformFees).toBeGreaterThanOrEqual(0);
    expect(resolveDriverPayoutFromOrder({ earningsRecorded: true, driverPayout: 0.79 })).toBe(
      0.79,
    );
  });
});
