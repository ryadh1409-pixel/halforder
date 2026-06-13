import {
  DRIVER_FULFILLMENT_TRANSITIONS,
  isForwardLifecycleTransition,
  isLegalDriverFulfillmentAction,
  isLegalDriverFulfillmentTransition,
  MARKETPLACE_ORDER_LIFECYCLE,
  marketplaceLifecycleRank,
} from '@/lib/orderLifecycleTransitions';
import { MARKETPLACE_DELIVERY_STATUS } from '@/lib/orderStatus';
import {
  evaluateSnapshotMergeDecision,
  type SnapshotMergeDecision,
} from '@/lib/orderSnapshotMergeDecision';

const T1 = 1_700_000_000_000;
const T2 = 1_700_000_001_000;
const T3 = 1_700_000_002_000;
const T4 = 1_700_000_003_000;
const T5 = 1_700_000_004_000;

describe('orderLifecycleTransitions', () => {
  it('defines the full marketplace lifecycle chain', () => {
    expect(MARKETPLACE_ORDER_LIFECYCLE).toEqual([
      'payment_confirmed',
      'accepted',
      'preparing',
      'ready_for_pickup',
      'driver_assigned',
      'picked_up',
      'delivered',
    ]);
  });

  it('allows forward-only lifecycle transitions', () => {
    const pairs: Array<[string, string]> = [
      ['payment_confirmed', 'accepted'],
      ['accepted', 'preparing'],
      ['preparing', 'ready_for_pickup'],
      ['ready_for_pickup', 'driver_assigned'],
      ['driver_assigned', 'picked_up'],
      ['picked_up', 'delivered'],
    ];
    for (const [from, to] of pairs) {
      expect(isForwardLifecycleTransition(from, to)).toBe(true);
      expect(isForwardLifecycleTransition(to, from)).toBe(false);
    }
  });

  it('allows driver_assigned -> picked_up and picked_up -> delivered', () => {
    expect(
      isLegalDriverFulfillmentTransition(
        MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
        MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
      ),
    ).toBe(true);
    expect(
      isLegalDriverFulfillmentTransition(
        MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
        MARKETPLACE_DELIVERY_STATUS.DELIVERED,
      ),
    ).toBe(true);
    expect(isLegalDriverFulfillmentAction(MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED, 'pickup')).toBe(
      true,
    );
    expect(isLegalDriverFulfillmentAction(MARKETPLACE_DELIVERY_STATUS.PICKED_UP, 'deliver')).toBe(true);
  });

  it('blocks backwards driver fulfillment transitions', () => {
    expect(
      isLegalDriverFulfillmentTransition(
        MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
        MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
      ),
    ).toBe(false);
    expect(
      isLegalDriverFulfillmentTransition(
        MARKETPLACE_DELIVERY_STATUS.DELIVERED,
        MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
      ),
    ).toBe(false);
  });

  it('exposes driver fulfillment transition map', () => {
    expect(DRIVER_FULFILLMENT_TRANSITIONS[MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED]).toContain(
      MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
    );
    expect(marketplaceLifecycleRank('driver_assigned')).toBeLessThan(
      marketplaceLifecycleRank('picked_up'),
    );
  });
});

describe('orderSnapshotMergeDecision', () => {
  function decide(
    local: { deliveryStatus: string; updatedAtMs: number | null },
    remote: { deliveryStatus: string; updatedAtMs: number | null },
  ): SnapshotMergeDecision {
    return evaluateSnapshotMergeDecision(local, remote);
  }

  it('A: local updatedAt null → Firestore wins', () => {
    expect(
      decide(
        { deliveryStatus: 'ready_for_pickup', updatedAtMs: null },
        { deliveryStatus: 'driver_assigned', updatedAtMs: T2 },
      ),
    ).toEqual({ accept: true, reason: 'local_updated_at_null_firestore_wins' });
  });

  it('B: remote updatedAt newer → Firestore wins', () => {
    expect(
      decide(
        { deliveryStatus: 'ready_for_pickup', updatedAtMs: T1 },
        { deliveryStatus: 'driver_assigned', updatedAtMs: T2 },
      ),
    ).toEqual({ accept: true, reason: 'remote_updated_at_newer' });
  });

  it('C: equal updatedAt → prefer Firestore', () => {
    expect(
      decide(
        { deliveryStatus: 'ready_for_pickup', updatedAtMs: T2 },
        { deliveryStatus: 'driver_assigned', updatedAtMs: T2 },
      ),
    ).toEqual({ accept: true, reason: 'equal_updated_at_prefer_firestore' });
  });

  it('D: local updatedAt newer → keep local', () => {
    expect(
      decide(
        { deliveryStatus: 'ready_for_pickup', updatedAtMs: T3 },
        { deliveryStatus: 'driver_assigned', updatedAtMs: T2 },
      ),
    ).toEqual({ accept: false, reason: 'local_updated_at_newer' });
  });

  it('E: never keeps ready_for_pickup over newer driver_assigned Firestore snapshot', () => {
    const decision = decide(
      { deliveryStatus: 'ready_for_pickup', updatedAtMs: null },
      { deliveryStatus: 'driver_assigned', updatedAtMs: 1_781_334_513_730 },
    );
    expect(decision.accept).toBe(true);
  });
});
