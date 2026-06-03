import {
  CUSTOMER_MARKETPLACE_TIMELINE,
  customerMarketplaceTimelineIndex,
} from '@/lib/customerMarketplaceTimeline';

describe('customerMarketplaceTimeline', () => {
  it('exposes Uber-style fulfillment steps', () => {
    const labels = CUSTOMER_MARKETPLACE_TIMELINE.map((s) => s.label);
    expect(labels).toContain('Restaurant accepted');
    expect(labels).toContain('Preparing');
    expect(labels).toContain('Ready for pickup');
    expect(labels).toContain('Driver assigned');
    expect(labels).toContain('Delivered');
  });

  it('advances index for payment_confirmed marketplace docs', () => {
    const idx = customerMarketplaceTimelineIndex({
      status: 'payment_confirmed',
      paymentStatus: 'paid',
      deliveryStatus: 'pending',
    });
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  it('returns -1 when cancelled', () => {
    expect(
      customerMarketplaceTimelineIndex({
        status: 'cancelled',
        paymentStatus: 'paid',
        deliveryStatus: 'cancelled',
      }),
    ).toBe(-1);
  });
});
