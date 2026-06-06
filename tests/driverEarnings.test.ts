import {
  calculateOrderPayout,
  calculateDriverEarningForOrder,
  DRIVER_EARNING_PERCENT,
  resolveOrderDeliveryFee,
} from '@/lib/driverEarnings';

describe('driverEarnings', () => {
  it('uses 80% of delivery fee for driver payout', () => {
    expect(DRIVER_EARNING_PERCENT).toBe(0.8);
    const payout = calculateOrderPayout({ totalPrice: 24.5, fees: 1.25 });
    expect(payout.customerTotal).toBe(24.5);
    expect(payout.deliveryFee).toBe(1.25);
    expect(payout.driverPayout).toBe(1);
    expect(payout.platformFee).toBe(0.25);
  });

  it('prefers persisted driverPayout when earningsRecorded', () => {
    expect(
      calculateDriverEarningForOrder({
        earningsRecorded: true,
        driverPayout: 0.79,
        fees: 0.99,
      }),
    ).toBe(0.79);
  });

  it('falls back to default fee when missing', () => {
    expect(resolveOrderDeliveryFee({})).toBe(0.99);
    expect(calculateOrderPayout({}).driverPayout).toBe(0.79);
  });
});
