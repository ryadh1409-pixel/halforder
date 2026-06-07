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

  it('starts at Order placed for payment_confirmed marketplace docs', () => {
    const idx = customerMarketplaceTimelineIndex({
      status: 'payment_confirmed',
      paymentStatus: 'paid',
      deliveryStatus: 'pending',
    });
    expect(idx).toBe(0);
    expect(CUSTOMER_MARKETPLACE_TIMELINE[idx]?.key).toBe('order_placed');
    expect(CUSTOMER_MARKETPLACE_TIMELINE[idx]?.label).toBe('Order placed');
  });

  it('shows Ready for pickup when kitchen marks ready_for_pickup', () => {
    const idx = customerMarketplaceTimelineIndex({
      status: 'ready_for_pickup',
      paymentStatus: 'paid',
      deliveryStatus: 'waiting_driver',
    });
    expect(CUSTOMER_MARKETPLACE_TIMELINE[idx]?.label).toBe('Ready for pickup');
  });

  it('shows Driver at restaurant when driver arrives (ready_for_pickup + driverId)', () => {
    const idx = customerMarketplaceTimelineIndex({
      status: 'ready_for_pickup',
      paymentStatus: 'paid',
      deliveryStatus: 'ready_for_pickup',
      driverId: 'driver-1',
    });
    expect(CUSTOMER_MARKETPLACE_TIMELINE[idx]?.key).toBe('driver_at_restaurant');
    expect(CUSTOMER_MARKETPLACE_TIMELINE[idx]?.label).toBe('Driver at restaurant');
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
