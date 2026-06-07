import {
  CUSTOMER_COURIER_RANK,
  resolveCustomerCourierRank,
} from '@/lib/customerCourierRank';
import {
  evaluateCustomerSnapshotFreshness,
  OrderSnapshotFreshnessGate,
  QuerySnapshotFreshnessGate,
  resolveOrderFreshnessMs,
  resolveOrderUpdatedAtMs,
} from '@/lib/orderSnapshotFreshness';

const T1 = 1_700_000_000_000;
const T2 = 1_700_000_001_000;
const T3 = 1_700_000_002_000;
const T4 = 1_700_000_003_000;
const T5 = 1_700_000_004_000;

describe('orderSnapshotFreshness', () => {
  it('resolveOrderUpdatedAtMs uses updatedAt fields only', () => {
    expect(
      resolveOrderUpdatedAtMs({
        updatedAtMs: T1,
        deliveredAtMs: T5,
      }),
    ).toBe(T1);
    expect(
      resolveOrderFreshnessMs({
        updatedAtMs: T1,
        deliveredAtMs: T5,
      }),
    ).toBe(T5);
  });

  it('rejects older updatedAt unconditionally', () => {
    const decision = evaluateCustomerSnapshotFreshness(
      {
        status: 'payment_confirmed',
        deliveryStatus: 'picked_up',
        updatedAtMs: T1,
        driverId: 'd1',
      },
      { fromCache: true, hasPendingWrites: false },
      {
        lastCourierRank: CUSTOMER_COURIER_RANK.DRIVER_ASSIGNED,
        lastUpdatedAtMs: T5,
        hasServerSnapshot: true,
        completionLocked: false,
      },
    );
    expect(decision.apply).toBe(false);
    expect(decision.reason).toBe('older_updatedAt');
  });

  it('rejects equal updatedAt with lower delivery rank', () => {
    const decision = evaluateCustomerSnapshotFreshness(
      {
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        updatedAtMs: T3,
        driverId: 'd1',
      },
      { fromCache: true, hasPendingWrites: false },
      {
        lastCourierRank: CUSTOMER_COURIER_RANK.PICKED_UP,
        lastUpdatedAtMs: T3,
        hasServerSnapshot: true,
        completionLocked: false,
      },
    );
    expect(decision.apply).toBe(false);
    expect(decision.reason).toBe('equal_timestamp_lower_rank');
  });

  it('rejects older updatedAt when courier rank does not advance', () => {
    const gate = new OrderSnapshotFreshnessGate();

    gate.shouldApply(
      {
        status: 'completed',
        deliveryStatus: 'delivered',
        updatedAtMs: T5,
      },
      { fromCache: false, hasPendingWrites: false },
    );

    expect(
      gate.shouldApply(
        {
          status: 'payment_confirmed',
          deliveryStatus: 'driver_assigned',
          updatedAtMs: T1,
        },
        { fromCache: true, hasPendingWrites: false },
      ),
    ).toBe(false);
  });

  it('accepts server forward courier progress through full delivery lifecycle', () => {
    const gate = new OrderSnapshotFreshnessGate();
    const steps = [
      { deliveryStatus: 'driver_assigned', driverId: 'd1', updatedAtMs: T1 },
      { deliveryStatus: 'ready_for_pickup', driverId: 'd1', updatedAtMs: T2 },
      { deliveryStatus: 'picked_up', driverId: 'd1', updatedAtMs: T3 },
      { status: 'completed', deliveryStatus: 'delivered', driverId: 'd1', updatedAtMs: T4 },
    ];

    for (const step of steps) {
      expect(
        gate.shouldApply(step, { fromCache: false, hasPendingWrites: false }),
      ).toBe(true);
    }

    expect(
      gate.shouldApply(
        { status: 'payment_confirmed', deliveryStatus: 'driver_assigned', updatedAtMs: T1 },
        { fromCache: true, hasPendingWrites: false },
      ),
    ).toBe(false);
  });

  it('accepts server forward courier progress even when updatedAt is missing on first cache', () => {
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

  it('locks completion and rejects forbidden transitions', () => {
    const gate = new OrderSnapshotFreshnessGate();

    gate.shouldApply(
      { status: 'completed', deliveryStatus: 'delivered', updatedAtMs: T4 },
      { fromCache: false, hasPendingWrites: false },
    );

    expect(
      gate.shouldApply(
        { status: 'driver_assigned', deliveryStatus: 'heading_to_restaurant', updatedAtMs: T5 },
        { fromCache: false, hasPendingWrites: false },
      ),
    ).toBe(false);

    expect(
      gate.shouldApply(
        { status: 'payment_confirmed', deliveryStatus: 'picked_up', updatedAtMs: T3 },
        { fromCache: true, hasPendingWrites: false },
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
