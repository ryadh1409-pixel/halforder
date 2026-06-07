import {
  CUSTOMER_COURIER_RANK,
  resolveCustomerCourierRank,
} from '@/lib/customerCourierRank';
import {
  OrderSnapshotFreshnessGate,
  QuerySnapshotFreshnessGate,
  resolveOrderFreshnessMs,
} from '@/lib/orderSnapshotFreshness';

describe('orderSnapshotFreshness', () => {
  it('resolveOrderFreshnessMs prefers latest lifecycle timestamp', () => {
    expect(
      resolveOrderFreshnessMs({
        updatedAt: { seconds: 10 },
        deliveredAt: { seconds: 100 },
      }),
    ).toBe(100_000);
  });

  it('accepts server forward courier progress even when updatedAt is missing', () => {
    const gate = new OrderSnapshotFreshnessGate();

    expect(
      gate.shouldApply(
        { status: 'payment_confirmed', deliveryStatus: 'driver_assigned' },
        { fromCache: true, hasPendingWrites: false },
      ),
    ).toBe(true);

    expect(
      gate.shouldApply(
        { status: 'payment_confirmed', deliveryStatus: 'ready_for_pickup', driverId: 'd1' },
        { fromCache: false, hasPendingWrites: false },
      ),
    ).toBe(true);

    expect(
      gate.shouldApply(
        { status: 'payment_confirmed', deliveryStatus: 'picked_up', driverId: 'd1' },
        { fromCache: false, hasPendingWrites: false },
      ),
    ).toBe(true);

    expect(
      gate.shouldApply(
        { status: 'payment_confirmed', deliveryStatus: 'driver_assigned' },
        { fromCache: true, hasPendingWrites: false },
      ),
    ).toBe(false);
  });

  it('locks completion and rejects stale pre-completion snapshots', () => {
    const gate = new OrderSnapshotFreshnessGate();

    gate.shouldApply(
      { status: 'completed', deliveryStatus: 'delivered' },
      { fromCache: false, hasPendingWrites: false },
    );

    expect(
      gate.shouldApply(
        { status: 'driver_assigned', deliveryStatus: 'heading_to_restaurant' },
        { fromCache: false, hasPendingWrites: false },
      ),
    ).toBe(false);
  });

  it('resolveCustomerCourierRank follows driver_assigned → ready_for_pickup → picked_up → delivered', () => {
    expect(resolveCustomerCourierRank({ deliveryStatus: 'driver_assigned' })).toBe(
      CUSTOMER_COURIER_RANK.DRIVER_ASSIGNED,
    );
    expect(
      resolveCustomerCourierRank({ deliveryStatus: 'ready_for_pickup', driverId: 'd1' }),
    ).toBe(CUSTOMER_COURIER_RANK.READY_FOR_PICKUP);
    expect(resolveCustomerCourierRank({ deliveryStatus: 'picked_up' })).toBe(
      CUSTOMER_COURIER_RANK.PICKED_UP,
    );
    expect(resolveCustomerCourierRank({ status: 'completed', deliveryStatus: 'delivered' })).toBe(
      CUSTOMER_COURIER_RANK.DELIVERED,
    );
  });

  it('QuerySnapshotFreshnessGate ignores cache after server query snapshot', () => {
    const gate = new QuerySnapshotFreshnessGate();
    expect(gate.shouldApply(true, 1)).toBe(true);
    expect(gate.shouldApply(false, 1)).toBe(true);
    expect(gate.shouldApply(true, 1)).toBe(false);
  });

  it('QuerySnapshotFreshnessGate rejects server snapshot that drops all docs', () => {
    const gate = new QuerySnapshotFreshnessGate();
    expect(gate.shouldApply(false, 2)).toBe(true);
    expect(gate.shouldApply(false, 0)).toBe(false);
    expect(gate.shouldApply(false, 1)).toBe(true);
  });
});
