import {
  calculateAdminOrderRevenue,
  calculateDriverWalletEarnings,
  calculateRestaurantEarnings,
  normalizeEarningsWalletConfig,
} from '@/lib/earningsWalletMath';

describe('earningsWalletMath', () => {
  const config = normalizeEarningsWalletConfig({
    restaurantCommissionPercent: 15,
    driverCommissionPercent: 20,
    deliveryBonusAmount: 6,
    deliveryBonusEnabled: true,
    serviceFeeDefault: 1.5,
    platformFeePercent: 0,
    restaurantDeductionsFlat: 0,
  });

  it('credits restaurant net of commission (never gross)', () => {
    const r = calculateRestaurantEarnings({ subtotal: 100 }, config);
    expect(r.foodTotal).toBe(100);
    expect(r.restaurantCommission).toBe(15);
    expect(r.netRestaurantEarnings).toBe(85);
  });

  it('credits driver delivery remainder + promotional bonus', () => {
    const d = calculateDriverWalletEarnings({ deliveryFee: 8 }, config);
    expect(d.commissionAmount).toBe(1.6);
    expect(d.deliveryEarnings).toBe(6.4);
    expect(d.bonus).toBe(6);
    expect(d.netAmount).toBe(12.4);
  });

  it('credits admin commissions and debits promo bonus', () => {
    const r = calculateRestaurantEarnings({ subtotal: 100 }, config);
    const d = calculateDriverWalletEarnings({ deliveryFee: 8 }, config);
    const a = calculateAdminOrderRevenue(r, d, { serviceFee: 1.5 }, config);
    expect(a.restaurantCommission).toBe(15);
    expect(a.driverCommission).toBe(1.6);
    expect(a.serviceFee).toBe(1.5);
    expect(a.promotionalBonusPaid).toBe(6);
    expect(a.netPlatformRevenueDelta).toBe(12.1);
  });
});
