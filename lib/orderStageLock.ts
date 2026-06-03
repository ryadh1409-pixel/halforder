import {
  compareOrderStage,
  deriveOrderStage,
  type DerivedOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';

const lockedStageByOrderId = new Map<string, DerivedOrderStage>();

/** Optimistic UI lock after successful accept — blocks visual downgrade until server catches up. */
export function lockOrderStage(orderId: string, stage: DerivedOrderStage): void {
  const id = orderId.trim();
  if (!id) return;
  lockedStageByOrderId.set(id, stage);
}

export function getLockedOrderStage(orderId: string): DerivedOrderStage | null {
  return lockedStageByOrderId.get(orderId.trim()) ?? null;
}

export function clearOrderStageLock(orderId: string): void {
  lockedStageByOrderId.delete(orderId.trim());
}

export function applyStageLockToOrder<T extends OrderStageInput>(order: T): T {
  const id = typeof order.id === 'string' ? order.id.trim() : '';
  if (!id) return order;

  const locked = getLockedOrderStage(id);
  if (!locked) return order;

  const current = deriveOrderStage(order);
  if (compareOrderStage(current, locked) >= 0) {
    if (compareOrderStage(current, locked) > 0) {
      clearOrderStageLock(id);
    }
    return order;
  }

  if (locked === 'preparing') {
    return {
      ...order,
      status: 'accepted',
      deliveryStatus: 'accepted',
    };
  }

  return order;
}
