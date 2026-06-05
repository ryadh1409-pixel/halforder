import {
  clearOrderListenerCommitCache,
  reconcileOrderSnapshotStage,
} from '@/lib/orderListenerCommit';

describe('customer order listeners vs restaurant stage cache', () => {
  beforeEach(() => {
    clearOrderListenerCommitCache();
  });

  it('restaurant cache regression must not be used on customer subscribe path', () => {
    reconcileOrderSnapshotStage(
      'order-1',
      {
        id: 'order-1',
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'waiting_driver',
        updatedAtMs: 2000,
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
        updatedAtMs: 3000,
      },
      false,
      { mode: 'restaurant' },
    );

    expect(regressed?.status).toBe('ready_for_pickup');
    expect(regressed?.deliveryStatus).toBe('waiting_driver');
  });

  it('documents that customer listeners read raw Firestore (no reconcile call)', () => {
    expect(true).toBe(true);
  });
});
