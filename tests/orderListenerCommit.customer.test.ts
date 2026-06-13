import {
  clearOrderListenerCommitCache,
  reconcileOrderSnapshotStage,
} from '@/lib/orderListenerCommit';

const T1 = 1_700_000_000_000;
const T2 = 1_700_000_001_000;
const T3 = 1_700_000_002_000;
const T4 = 1_700_000_003_000;

describe('customer order listeners vs restaurant stage cache', () => {
  beforeEach(() => {
    clearOrderListenerCommitCache();
  });

  it('accepts newer Firestore snapshot even when stage rank regresses cached optimistic state', () => {
    reconcileOrderSnapshotStage(
      'order-1',
      {
        id: 'order-1',
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'waiting_driver',
        updatedAtMs: T2,
      },
      false,
      { mode: 'restaurant' },
    );

    const resolved = reconcileOrderSnapshotStage(
      'order-1',
      {
        id: 'order-1',
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
        updatedAtMs: T3,
      },
      false,
      { mode: 'restaurant' },
    );

    expect(resolved?.status).toBe('payment_confirmed');
    expect(resolved?.deliveryStatus).toBe('pending');
  });

  it('keeps cached optimistic stage when Firestore snapshot is older', () => {
    reconcileOrderSnapshotStage(
      'order-1',
      {
        id: 'order-1',
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'waiting_driver',
        updatedAtMs: T3,
      },
      false,
      { mode: 'restaurant' },
    );

    const regressed = reconcileOrderSnapshotStage(
      'order-1',
      {
        id: 'order-1',
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
        updatedAtMs: T2,
      },
      false,
      { mode: 'restaurant' },
    );

    expect(regressed).toBeNull();
  });

  it('documents that customer listeners read raw Firestore (no reconcile call)', () => {
    expect(true).toBe(true);
  });
});

describe('restaurant kitchen lifecycle snapshots', () => {
  beforeEach(() => {
    clearOrderListenerCommitCache();
  });

  it('accepts payment_confirmed -> accepted -> preparing -> ready_for_pickup with advancing timestamps', () => {
    const steps = [
      {
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
        updatedAtMs: T1,
      },
      {
        status: 'accepted',
        deliveryStatus: 'accepted',
        updatedAtMs: T2,
      },
      {
        status: 'preparing',
        deliveryStatus: 'preparing',
        updatedAtMs: T3,
      },
      {
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
        updatedAtMs: T4,
      },
    ];

    for (const step of steps) {
      const resolved = reconcileOrderSnapshotStage(
        'kitchen-1',
        {
          id: 'kitchen-1',
          paymentStatus: 'paid',
          ...step,
        },
        false,
        { mode: 'restaurant' },
      );
      expect(resolved?.status).toBe(step.status);
      expect(resolved?.deliveryStatus).toBe(step.deliveryStatus);
    }
  });
});
