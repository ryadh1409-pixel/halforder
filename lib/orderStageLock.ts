import {
  compareOrderStage,
  deriveOrderStage,
  restaurantKitchenSubstage,
  type DerivedOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';

export type StageLockOptions = {
  kitchenSubstage?: 'accepted' | 'preparing';
};

type StageLock = {
  stage: DerivedOrderStage;
  kitchenSubstage?: 'accepted' | 'preparing';
};

const lockedStageByOrderId = new Map<string, StageLock>();

/** Optimistic UI lock after successful kitchen actions. */
export function lockOrderStage(
  orderId: string,
  stage: DerivedOrderStage,
  options?: StageLockOptions,
): void {
  const id = orderId.trim();
  if (!id) return;
  lockedStageByOrderId.set(id, {
    stage,
    kitchenSubstage: options?.kitchenSubstage,
  });
}

export function getLockedOrderStage(orderId: string): DerivedOrderStage | null {
  return lockedStageByOrderId.get(orderId.trim())?.stage ?? null;
}

export function clearOrderStageLock(orderId: string): void {
  lockedStageByOrderId.delete(orderId.trim());
}

export function applyStageLockToOrder<T extends OrderStageInput>(order: T): T {
  const id = typeof order.id === 'string' ? order.id.trim() : '';
  if (!id) return order;

  const lock = lockedStageByOrderId.get(id);
  if (!lock) return order;

  const current = deriveOrderStage(order);

  // Same derived stage but kitchen substage still behind lock (e.g. accepted → preparing).
  if (current === lock.stage && lock.kitchenSubstage) {
    const currentSub = restaurantKitchenSubstage(order);
    const subRank = (sub: 'accepted' | 'preparing' | null | undefined) =>
      sub === 'preparing' ? 1 : sub === 'accepted' ? 0 : -1;
    if (subRank(lock.kitchenSubstage) > subRank(currentSub)) {
      if (lock.stage === 'preparing' && lock.kitchenSubstage === 'preparing') {
        return {
          ...order,
          status: 'preparing',
          deliveryStatus: 'preparing',
          preparedAtMs:
            (order as { preparedAtMs?: number | null }).preparedAtMs ?? Date.now(),
        };
      }
      if (lock.stage === 'preparing' && lock.kitchenSubstage === 'accepted') {
        return {
          ...order,
          status: 'accepted',
          deliveryStatus: 'accepted',
          acceptedAtMs: order.acceptedAtMs ?? Date.now(),
        };
      }
    }
  }

  if (compareOrderStage(current, lock.stage) >= 0) {
    if (compareOrderStage(current, lock.stage) > 0) {
      clearOrderStageLock(id);
    }
    return order;
  }

  if (lock.stage === 'preparing') {
    if (lock.kitchenSubstage === 'preparing') {
      return {
        ...order,
        status: 'preparing',
        deliveryStatus: 'preparing',
        preparedAtMs:
          (order as { preparedAtMs?: number | null }).preparedAtMs ?? Date.now(),
      };
    }
    return {
      ...order,
      status: 'accepted',
      deliveryStatus: 'accepted',
      acceptedAtMs: order.acceptedAtMs ?? Date.now(),
    };
  }

  if (lock.stage === 'driver_assignment') {
    return {
      ...order,
      status: 'ready_for_pickup',
      deliveryStatus: 'ready_for_pickup',
      readyAtMs: (order as { readyAtMs?: number | null }).readyAtMs ?? Date.now(),
      preparedAtMs:
        (order as { preparedAtMs?: number | null }).preparedAtMs ?? Date.now(),
    };
  }

  return order;
}
