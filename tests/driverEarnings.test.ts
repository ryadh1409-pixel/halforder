import {
  calculateDriverEarningForOrder,
  DRIVER_EARNING_PERCENT,
  resolveOrderDeliveryFee,
} from '@/lib/driverEarnings';

describe('driverEarnings', () => {
  it('uses 80% of delivery fee', () => {
    expect(DRIVER_EARNING_PERCENT).toBe(0.8);
    expect(resolveOrderDeliveryFee({ fees: 1.25 })).toBe(1.25);
    expect(calculateDriverEarningForOrder({ fees: 1.25 })).toBe(1);
  });

  it('falls back to default fee when missing', () => {
    expect(calculateDriverEarningForOrder({})).toBe(0.79);
  });
});
