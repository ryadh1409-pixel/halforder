import {
  compareOrderStage,
  deriveOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';

const lastCommittedByOrderId = new Map<string, OrderStageInput>();

/**
 * Prefer last committed server snapshot when a pending local write would regress UI stage.
 */
export function reconcileOrderSnapshotStage<T extends OrderStageInput>(
  orderId: string,
  snapshot: T,
  hasPendingWrites: boolean,
): T {
  const id = orderId.trim();
  if (!id) return snapshot;

  const withId = { ...snapshot, id };
  const stage = deriveOrderStage(withId);

  if (!hasPendingWrites) {
    lastCommittedByOrderId.set(id, {
      status: withId.status,
      paymentStatus: withId.paymentStatus,
      deliveryStatus: withId.deliveryStatus,
    });
    return snapshot;
  }

  const committed = lastCommittedByOrderId.get(id);
  if (!committed) {
    return snapshot;
  }

  if (compareOrderStage(stage, deriveOrderStage({ ...committed, id })) < 0) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ORDER STAGE] ignoring optimistic regression', {
        orderId: id,
        optimisticStage: stage,
        committedStage: deriveOrderStage({ ...committed, id }),
        optimisticStatus: snapshot.status ?? null,
        committedStatus: committed.status ?? null,
        hasPendingWrites: true,
      });
    }
    return {
      ...snapshot,
      status: committed.status ?? snapshot.status,
      deliveryStatus: committed.deliveryStatus ?? snapshot.deliveryStatus,
      paymentStatus: committed.paymentStatus ?? snapshot.paymentStatus,
    };
  }

  return snapshot;
}

export function clearOrderListenerCommitCache(orderId?: string): void {
  if (!orderId) {
    lastCommittedByOrderId.clear();
    return;
  }
  lastCommittedByOrderId.delete(orderId.trim());
}
