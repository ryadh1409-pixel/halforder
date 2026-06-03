import {
  compareOrderStage,
  deriveOrderStage,
  type DerivedOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';
import { applyStageLockToOrder } from '@/lib/orderStageLock';

type CachedStageFields = {
  status: unknown;
  paymentStatus: unknown;
  deliveryStatus: unknown;
  stage: DerivedOrderStage;
};

const highestStageByOrderId = new Map<string, CachedStageFields>();

function isExplicitLifecycleReset(order: OrderStageInput): boolean {
  const status = typeof order.status === 'string' ? order.status.trim().toLowerCase() : '';
  return (
    status === 'cancelled' ||
    status === 'rejected' ||
    status === 'expired' ||
    status === 'payment_failed'
  );
}

function cacheFromOrder(order: OrderStageInput, stage: DerivedOrderStage): CachedStageFields {
  return {
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    stage,
  };
}

/**
 * Never visually downgrade marketplace stage from accepted/preparing unless explicit cancel/reject/expire.
 * Also applies optimistic accept locks from {@link applyStageLockToOrder}.
 */
export function reconcileOrderSnapshotStage<T extends OrderStageInput>(
  orderId: string,
  snapshot: T,
  hasPendingWrites: boolean,
): T {
  const id = orderId.trim();
  if (!id) return snapshot;

  let withId = applyStageLockToOrder({ ...snapshot, id });
  const incomingStage = deriveOrderStage(withId);
  const previousHigh = highestStageByOrderId.get(id);

  if (isExplicitLifecycleReset(withId)) {
    highestStageByOrderId.set(id, cacheFromOrder(withId, incomingStage));
    return withId;
  }

  if (previousHigh && compareOrderStage(incomingStage, previousHigh.stage) < 0) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ORDER STAGE] ignoring stale snapshot regression', {
        orderId: id,
        incomingStage,
        keptStage: previousHigh.stage,
        incomingStatus: withId.status ?? null,
        keptStatus: previousHigh.status ?? null,
        hasPendingWrites,
      });
    }
    withId = {
      ...withId,
      status: previousHigh.status ?? withId.status,
      deliveryStatus: previousHigh.deliveryStatus ?? withId.deliveryStatus,
      paymentStatus: previousHigh.paymentStatus ?? withId.paymentStatus,
    };
  } else if (
    !previousHigh ||
    compareOrderStage(incomingStage, previousHigh.stage) >= 0
  ) {
    highestStageByOrderId.set(id, cacheFromOrder(withId, deriveOrderStage(withId)));
  }

  if (!hasPendingWrites) {
    const committedStage = deriveOrderStage(withId);
    highestStageByOrderId.set(id, cacheFromOrder(withId, committedStage));
  }

  return withId;
}

export function clearOrderListenerCommitCache(orderId?: string): void {
  if (!orderId) {
    highestStageByOrderId.clear();
    return;
  }
  highestStageByOrderId.delete(orderId.trim());
}
