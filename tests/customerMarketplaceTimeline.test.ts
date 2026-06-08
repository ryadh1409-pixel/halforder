import {
  buildCustomerTimelineRenderSteps,
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

  it('marks every stage completed for status=completed and deliveryStatus=delivered', () => {
    const steps = buildCustomerTimelineRenderSteps({
      status: 'completed',
      paymentStatus: 'paid',
      deliveryStatus: 'delivered',
      driverId: 'driver-1',
    });

    expect(steps).toHaveLength(CUSTOMER_MARKETPLACE_TIMELINE.length);
    expect(steps.every((s) => s.completed)).toBe(true);
    expect(steps.some((s) => s.current)).toBe(false);
    expect(steps.map((s) => s.id)).toEqual(
      CUSTOMER_MARKETPLACE_TIMELINE.map((s) => s.key),
    );
  });

  it('marks every stage completed when deliveryStatus=delivered despite payment_confirmed status', () => {
    const steps = buildCustomerTimelineRenderSteps({
      status: 'payment_confirmed',
      paymentStatus: 'paid',
      deliveryStatus: 'delivered',
      driverId: 'driver-1',
    });

    expect(steps.every((s) => s.completed)).toBe(true);
    expect(steps.some((s) => s.current)).toBe(false);
  });

  it('uses step.completed flags — not only currentStep match — for in-progress orders', () => {
    const steps = buildCustomerTimelineRenderSteps({
      status: 'payment_confirmed',
      paymentStatus: 'paid',
      deliveryStatus: 'driver_assigned',
      driverId: 'driver-1',
    });

    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.order_placed?.completed).toBe(true);
    expect(byId.driver_assigned?.completed).toBe(true);
    expect(byId.driver_assigned?.current).toBe(true);
    expect(byId.driver_at_restaurant?.completed).toBe(false);
    expect(byId.delivered?.completed).toBe(false);
  });
});
