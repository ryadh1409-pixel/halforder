import { applyStageLockToOrder, getLockedOrderStage } from '@/lib/orderStageLock';
import { restaurantOrderSnapshotFingerprint } from '@/lib/restaurantOrderListDedup';
import {
  compareOrderStage,
  deriveOrderStage,
  type DerivedOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';
import { safeToMillis } from '@/utils/safeToMillis';

type CachedStageFields = {
  status: unknown;
  paymentStatus: unknown;
  deliveryStatus: unknown;
  stage: DerivedOrderStage;
  updatedAtMs: number;
  fingerprint: string;
};

const highestStageByOrderId = new Map<string, CachedStageFields>();

function resolveUpdatedAtMs(order: OrderStageInput): number {
  if (order.updatedAtMs != null && Number.isFinite(order.updatedAtMs)) {
    return order.updatedAtMs;
  }
  return safeToMillis(order.updatedAt) ?? 0;
}

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
  const updatedAtMs = resolveUpdatedAtMs(order);
  return {
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    stage,
    updatedAtMs,
    fingerprint: restaurantOrderSnapshotFingerprint({
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      paymentStatus: order.paymentStatus,
      updatedAtMs,
    }),
  };
}

/**
 * Commits a restaurant listener snapshot: drops older/duplicate Firestore events,
 * never visually downgrades marketplace stage unless explicit cancel/reject/expire.
 *
 * @returns `null` when the snapshot should be ignored (no UI/state update).
 */
export function reconcileOrderSnapshotStage<T extends OrderStageInput>(
  orderId: string,
  snapshot: T,
  hasPendingWrites: boolean,
): T | null {
  const id = orderId.trim();
  if (!id) return snapshot;

  let withId = applyStageLockToOrder({ ...snapshot, id });
  const incomingStage = deriveOrderStage(withId);
  const lockedStage = getLockedOrderStage(id);
  if (
    lockedStage &&
    !hasPendingWrites &&
    compareOrderStage(incomingStage, lockedStage) < 0
  ) {
    return null;
  }

  const incomingMs = resolveUpdatedAtMs(withId);
  const previousHigh = highestStageByOrderId.get(id);

  if (
    previousHigh &&
    incomingMs > 0 &&
    previousHigh.updatedAtMs > 0 &&
    incomingMs < previousHigh.updatedAtMs &&
    !hasPendingWrites
  ) {
    return null;
  }

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
    const nextCache = cacheFromOrder(withId, committedStage);
    if (
      previousHigh &&
      previousHigh.fingerprint === nextCache.fingerprint &&
      previousHigh.updatedAtMs === nextCache.updatedAtMs
    ) {
      return null;
    }
    highestStageByOrderId.set(id, nextCache);
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
