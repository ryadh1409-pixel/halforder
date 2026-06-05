import { lockOrderStage, type StageLockOptions } from '@/lib/orderStageLock';
import { applyProtectedOrderPatch } from '@/services/orderService';
import type { OrderStatus, RestaurantOrder } from '@/services/orderService';
import {
  deriveOrderStage,
  getRestaurantOrderPresentation,
  type OrderStageInput,
} from '@/services/orderStage';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';

export type RestaurantKitchenAction = 'accept' | 'preparing' | 'ready' | 'picked_up';

type KitchenPatch = {
  status: OrderStatus;
  deliveryStatus: string;
  updatedBy: string;
  acceptedAt?: ReturnType<typeof serverTimestamp>;
  preparedAt?: ReturnType<typeof serverTimestamp>;
  readyAt?: ReturnType<typeof serverTimestamp>;
  pickedUpAt?: ReturnType<typeof serverTimestamp>;
  driverId?: null;
  assignedDriverId?: null;
  driverName?: null;
  driverPhone?: null;
};

function normField(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function buildRestaurantKitchenPatch(action: RestaurantKitchenAction): KitchenPatch {
  switch (action) {
    case 'accept':
      return {
        status: 'accepted',
        deliveryStatus: 'accepted',
        updatedBy: 'restaurantAccept',
        acceptedAt: serverTimestamp(),
      };
    case 'preparing':
      return {
        status: 'preparing',
        deliveryStatus: 'preparing',
        updatedBy: 'restaurantPreparing',
        preparedAt: serverTimestamp(),
      };
    case 'ready':
      return {
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
        updatedBy: 'restaurantReady',
        preparedAt: serverTimestamp(),
        readyAt: serverTimestamp(),
      };
    case 'picked_up':
      return {
        status: 'picked_up',
        deliveryStatus: 'picked_up',
        updatedBy: 'restaurantPickedUp',
        pickedUpAt: serverTimestamp(),
      };
  }
}

export function stageLockForKitchenAction(
  action: RestaurantKitchenAction,
): { stage: ReturnType<typeof deriveOrderStage>; options?: StageLockOptions } {
  switch (action) {
    case 'accept':
      return { stage: 'preparing', options: { kitchenSubstage: 'accepted' } };
    case 'preparing':
      return { stage: 'preparing', options: { kitchenSubstage: 'preparing' } };
    case 'ready':
      return { stage: 'driver_assignment' };
    case 'picked_up':
      return { stage: 'picked_up' };
  }
}

/** Optimistic local fields applied before Firestore listener roundtrip. */
export function optimisticRestaurantOrderPatch(
  action: RestaurantKitchenAction,
): Partial<RestaurantOrder> {
  const now = Date.now();
  const patch = buildRestaurantKitchenPatch(action);
  const base: Partial<RestaurantOrder> = {
    status: patch.status,
    deliveryStatus: patch.deliveryStatus as RestaurantOrder['deliveryStatus'],
    updatedAtMs: now,
  };
  if (action === 'accept') {
    base.acceptedAtMs = now;
  }
  if (action === 'preparing') {
    base.acceptedAtMs = base.acceptedAtMs ?? now;
    base.preparedAtMs = now;
  }
  if (action === 'ready') {
    base.preparedAtMs = base.preparedAtMs ?? now;
    base.readyAtMs = now;
  }
  if (action === 'picked_up') {
    base.pickedUpAtMs = now;
  }
  return base;
}

export function isDuplicateKitchenTransition(
  current: OrderStageInput,
  patch: Record<string, unknown>,
): boolean {
  const nextStatus = patch.status;
  const nextDelivery = patch.deliveryStatus;
  if (nextStatus === undefined && nextDelivery === undefined) {
    return false;
  }
  const statusMatch =
    nextStatus === undefined || normField(current.status) === normField(nextStatus);
  const deliveryMatch =
    nextDelivery === undefined ||
    normField(current.deliveryStatus) === normField(nextDelivery);
  return statusMatch && deliveryMatch;
}

export function isLegalRestaurantKitchenAction(
  current: OrderStageInput,
  action: RestaurantKitchenAction,
): boolean {
  const presentation = getRestaurantOrderPresentation(current);
  switch (action) {
    case 'accept':
      return presentation.canAccept;
    case 'preparing':
      return presentation.canStartPreparing;
    case 'ready':
      return presentation.canReady;
    case 'picked_up':
      return presentation.derivedStage === 'driver_assignment';
    default:
      return false;
  }
}

export function logRestaurantAction(
  orderId: string,
  action: RestaurantKitchenAction,
  current: OrderStageInput,
  patch: Record<string, unknown>,
): void {
  console.log('[RESTAURANT ACTION]', {
    orderId,
    action,
    currentStatus: current.status ?? null,
    nextStatus: patch.status ?? null,
    currentDeliveryStatus: current.deliveryStatus ?? null,
    nextDeliveryStatus: patch.deliveryStatus ?? null,
    derivedStage: deriveOrderStage(current),
    timestamp: Date.now(),
  });
}

export type ApplyRestaurantKitchenResult = 'applied' | 'skipped_duplicate' | 'skipped_illegal';

/**
 * Idempotent restaurant kitchen transition — protected writes only.
 * Call {@link lockOrderStage} + optimistic patch before awaiting when possible.
 */
export async function applyRestaurantKitchenAction(
  orderId: string,
  action: RestaurantKitchenAction,
  seedCurrent?: OrderStageInput | null,
): Promise<ApplyRestaurantKitchenResult> {
  const id = orderId.trim();
  if (!id) throw new Error('Order id is required');

  let current: OrderStageInput = seedCurrent ? { id, ...seedCurrent } : { id };
  if (!seedCurrent) {
    const snap = await getDoc(doc(db, 'orders', id));
    if (!snap.exists()) throw new Error('Order not found');
    current = { id, ...(snap.data() as Record<string, unknown>) };
  }

  if (!isLegalRestaurantKitchenAction(current, action)) {
    console.warn('[RESTAURANT ACTION] rejected illegal transition', {
      orderId: id,
      action,
      derivedStage: deriveOrderStage(current),
      status: current.status ?? null,
      deliveryStatus: current.deliveryStatus ?? null,
    });
    return 'skipped_illegal';
  }

  const patch = buildRestaurantKitchenPatch(action) as Record<string, unknown>;
  patch.updatedAt = serverTimestamp();
  patch.estimatedDeliveryTime = 35;

  if (isDuplicateKitchenTransition(current, patch)) {
    console.warn('[ORDER ACTION] skipped duplicate transition — Firestore NOT updated', {
      orderId: id,
      action,
      seedStatus: current.status ?? null,
      seedDeliveryStatus: current.deliveryStatus ?? null,
      patchStatus: patch.status ?? null,
      patchDeliveryStatus: patch.deliveryStatus ?? null,
    });
    return 'skipped_duplicate';
  }

  logRestaurantAction(id, action, current, patch);
  console.log('[RESTAURANT FIRESTORE WRITE] applying kitchen patch', {
    orderId: id,
    action,
    seedStatus: current.status ?? null,
    seedDeliveryStatus: current.deliveryStatus ?? null,
    patchStatus: patch.status ?? null,
    patchDeliveryStatus: patch.deliveryStatus ?? null,
  });
  await applyProtectedOrderPatch(id, patch);
  return 'applied';
}

/** Apply optimistic lock + optional hook patch immediately on tap. */
export function primeRestaurantKitchenOptimistic(
  orderId: string,
  action: RestaurantKitchenAction,
): Partial<RestaurantOrder> {
  const { stage, options } = stageLockForKitchenAction(action);
  lockOrderStage(orderId, stage, options);
  return optimisticRestaurantOrderPatch(action);
}
