import {
  DELIVERY_STAGE_RANK,
  isDeliveryStageRegression,
  resolveDeliveryStageRank,
} from '@/lib/deliveryStageRank';
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

describe('deliveryStageRank', () => {
  it('DELIVERY_STAGE_RANK matches customer lifecycle order', () => {
    expect(DELIVERY_STAGE_RANK.driver_assigned).toBe(1);
    expect(DELIVERY_STAGE_RANK.ready_for_pickup).toBe(2);
    expect(DELIVERY_STAGE_RANK.picked_up).toBe(3);
    expect(DELIVERY_STAGE_RANK.delivered).toBe(4);
  });

  it('resolveDeliveryStageRank uses max of status and deliveryStatus', () => {
    expect(
      resolveDeliveryStageRank({
        status: 'payment_confirmed',
        deliveryStatus: 'picked_up',
      }),
    ).toBe(3);
    expect(
      resolveDeliveryStageRank({
        status: 'completed',
        deliveryStatus: 'delivered',
      }),
    ).toBe(4);
  });
});

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

  it('accepts forward delivery stage even when updatedAt is older', () => {
    const decision = evaluateCustomerSnapshotFreshness(
      {
        status: 'payment_confirmed',
        deliveryStatus: 'picked_up',
        updatedAtMs: T1,
        driverId: 'd1',
      },
      { fromCache: false, hasPendingWrites: false },
      {
        lastCourierRank: DELIVERY_STAGE_RANK.driver_assigned,
        lastUpdatedAtMs: T5,
        hasServerSnapshot: true,
        completionLocked: false,
      },
    );
    expect(decision.apply).toBe(true);
    expect(decision.reason).toBe('delivery_stage_forward');
  });

  it('accepts delivered snapshot when updatedAt is null (serverTimestamp pending)', () => {
    const decision = evaluateCustomerSnapshotFreshness(
      {
        status: 'completed',
        deliveryStatus: 'delivered',
        driverId: 'd1',
      },
      { fromCache: false, hasPendingWrites: false },
      {
        lastCourierRank: DELIVERY_STAGE_RANK.driver_assigned,
        lastUpdatedAtMs: T5,
        hasServerSnapshot: true,
        completionLocked: false,
      },
    );
    expect(decision.apply).toBe(true);
    expect(decision.reason).toBe('completed');
  });

  it('rejects same-stage snapshot with older updatedAt', () => {
    const decision = evaluateCustomerSnapshotFreshness(
      {
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        updatedAtMs: T1,
        driverId: 'd1',
      },
      { fromCache: true, hasPendingWrites: false },
      {
        lastCourierRank: DELIVERY_STAGE_RANK.driver_assigned,
        lastUpdatedAtMs: T3,
        hasServerSnapshot: true,
        completionLocked: false,
      },
    );
    expect(decision.apply).toBe(false);
    expect(decision.reason).toBe('older_updatedAt_same_stage');
  });

  it('rejects delivery stage regression from cache', () => {
    const decision = evaluateCustomerSnapshotFreshness(
      {
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        updatedAtMs: T3,
        driverId: 'd1',
      },
      { fromCache: true, hasPendingWrites: false },
      {
        lastCourierRank: DELIVERY_STAGE_RANK.picked_up,
        lastUpdatedAtMs: T3,
        hasServerSnapshot: true,
        completionLocked: false,
      },
    );
    expect(decision.apply).toBe(false);
    expect(decision.reason).toBe('delivery_stage_regression');
  });

  it('rejects older updatedAt when delivery stage does not advance', () => {
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

  it('accepts server forward delivery progress through full lifecycle', () => {
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

  it('accepts server forward delivery progress even when updatedAt is missing', () => {
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

  it('isDeliveryStageRegression detects backward stage', () => {
    expect(isDeliveryStageRegression(DELIVERY_STAGE_RANK.picked_up, DELIVERY_STAGE_RANK.driver_assigned)).toBe(
      true,
    );
    expect(isDeliveryStageRegression(DELIVERY_STAGE_RANK.driver_assigned, DELIVERY_STAGE_RANK.delivered)).toBe(
      false,
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
