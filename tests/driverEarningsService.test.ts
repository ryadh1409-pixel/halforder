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

  it('sums payouts from delivery fee × configured percent', () => {
    const stats = buildDriverEarningsStats(
      [
        {
          id: 'o1',
          data: () => ({
            status: 'completed',
            deliveryStatus: 'delivered',
            earningsRecorded: true,
            deliveryFee: 0.9875,
            driverPayout: 0.5,
          }),
        },
        {
          id: 'o2',
          data: () => ({
            status: 'completed',
            deliveryStatus: 'delivered',
            earningsRecorded: true,
            deliveryFee: 1.5,
            driverPayout: 0.5,
          }),
        },
      ],
      Date.now(),
      80,
    );
    expect(stats.deliveries).toBe(2);
    expect(stats.earnings).toBe(1.99);
    expect(stats.platformFees).toBeGreaterThanOrEqual(0);
    expect(
      resolveDriverPayoutFromOrder(
        { earningsRecorded: true, deliveryFee: 0.9875, driverPayout: 0.5 },
        80,
      ),
    ).toBe(0.79);
  });
});
