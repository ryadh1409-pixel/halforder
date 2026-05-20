import {
  calculateDeliveryFee,
  calculateETA,
  calculateServiceFee,
  deliveryFeeAmountFromDistanceKm,
  formatCad,
  formatDistanceKm,
  isOntarioBusyHour,
  resolvePromoTags,
} from '@/lib/restaurantStoreMetrics';

describe('restaurantStoreMetrics (Ontario)', () => {
  it('formats CAD with two decimals', () => {
    expect(formatCad(2.9)).toBe('$2.90');
    expect(formatCad(14.49)).toBe('$14.49');
  });

  it('formats distance in km', () => {
    expect(formatDistanceKm(0.8)).toBe('0.8 km');
    expect(formatDistanceKm(2.44)).toBe('2.4 km');
    expect(formatDistanceKm(null)).toBeNull();
  });

  it('tiers delivery fee by distance', () => {
    expect(deliveryFeeAmountFromDistanceKm(0)).toBe(0.99);
    expect(deliveryFeeAmountFromDistanceKm(2)).toBe(2.99);
    expect(deliveryFeeAmountFromDistanceKm(5)).toBe(5.99);
    expect(deliveryFeeAmountFromDistanceKm(13)).toBe(8.99);
  });

  it('returns checkout copy when distance unknown', () => {
    expect(
      calculateDeliveryFee({
        mode: 'delivery',
        distanceKm: null,
        firestoreFee: null,
      }).label,
    ).toBe('Calculated at checkout');
  });

  it('uses realistic ETA bands', () => {
    expect(calculateETA({ mode: 'pickup', distanceKm: 1 })).toBe('10–20 min');
    expect(
      calculateETA({ mode: 'delivery', distanceKm: 1, busy: false }),
    ).toBe('15–25 min');
    expect(
      calculateETA({ mode: 'delivery', distanceKm: 3, busy: false }),
    ).toBe('25–40 min');
    expect(
      calculateETA({ mode: 'delivery', distanceKm: 3, busy: true }),
    ).toBe('35–55 min');
  });

  it('calculates service fee for small and large orders', () => {
    expect(calculateServiceFee({ subtotal: 0 }).label).toBe('$1.49');
    expect(calculateServiceFee({ subtotal: 12 }).amount).toBeGreaterThanOrEqual(
      0.99,
    );
    expect(calculateServiceFee({ subtotal: 12 }).amount).toBeLessThanOrEqual(2.49);
    expect(calculateServiceFee({ subtotal: 60 }).amount).toBeLessThanOrEqual(6.99);
  });

  it('only surfaces approved promo tags', () => {
    const tags = resolvePromoTags({
      data: { promoLabel: 'Buy 1 Get 1 pizza' },
      menuPromotions: [],
      reviewCount: 5,
      deliveryFeeAmount: 0,
      isPopularNearby: true,
    });
    expect(tags).toContain('Free delivery');
    expect(tags).toContain('Buy 1 Get 1');
    expect(tags).toContain('Popular nearby');
  });

  it('detects busy hours without throwing', () => {
    expect(typeof isOntarioBusyHour(new Date('2026-05-20T18:30:00'))).toBe(
      'boolean',
    );
  });
});
