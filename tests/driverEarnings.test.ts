import {
  calculateOrderPayout,
  calculateDriverEarningForOrder,
  DEFAULT_DRIVER_PAYOUT_PERCENT,
  DRIVER_EARNING_PERCENT,
  resolveOrderDeliveryFee,
} from '@/lib/driverEarnings';

describe('driverEarnings', () => {
  it('uses configured percent of delivery fee for driver payout', () => {
    expect(DEFAULT_DRIVER_PAYOUT_PERCENT).toBe(80);
    expect(DRIVER_EARNING_PERCENT).toBe(0.8);
    const payout = calculateOrderPayout({ totalPrice: 24.5, fees: 1.25 }, 80);
    expect(payout.customerTotal).toBe(24.5);
    expect(payout.deliveryFee).toBe(1.25);
    expect(payout.driverPayout).toBe(1);
    expect(payout.platformFee).toBe(0.25);
  });

  it('supports a custom admin percentage', () => {
    const payout = calculateOrderPayout({ deliveryFee: 10 }, 70);
    expect(payout.driverPayout).toBe(7);
    expect(payout.platformFee).toBe(3);
  });

  it('recalculates from delivery fee with configured percent', () => {
    expect(
      calculateDriverEarningForOrder(
        {
          earningsRecorded: true,
          driverPayout: 0.79,
          fees: 0.99,
        },
        80,
      ),
    ).toBe(0.79);
  });

  it('falls back to default fee when missing', () => {
    expect(resolveOrderDeliveryFee({})).toBe(0.99);
    expect(calculateOrderPayout({}, 80).driverPayout).toBe(0.79);
  });
});
