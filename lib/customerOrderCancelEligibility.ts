import { canCustomerCancelMarketplaceOrder } from '@/lib/customerOrderCancelUx';
import { deriveOrderStage, type OrderStageInput } from '@/services/orderStage';

/** Mirrors `marketplaceOrderCustomerCancellableStatusOk` in firestore.rules */
const FIRESTORE_CUSTOMER_CANCELLABLE_STATUSES = new Set([
  'awaiting_payment',
  'payment_processing',
  'payment_confirmed',
  'pending',
  'pending_driver',
  'accepted',
  'preparing',
  'restaurant_accepted',
]);

const TERMINAL_KITCHEN = new Set(['cancelled', 'rejected', 'delivered', 'expired', 'completed']);
const BLOCKED_COURIER = new Set([
  'ready',
  'ready_for_pickup',
  'picked_up',
  'on_the_way',
  'delivered',
]);
const BLOCKED_KITCHEN = new Set(['ready', 'ready_for_pickup', 'picked_up', 'on_the_way', 'arrived_customer']);

export type CustomerCancelWriteDiagnostic = {
  allowed: boolean;
  rejectBranch: string | null;
  orderStage: string;
  firestoreRulePath: string;
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function orderOwnerUid(order: OrderStageInput & { customerId?: unknown; userId?: unknown }): string {
  const userId = typeof order.userId === 'string' ? order.userId.trim() : '';
  if (userId) return userId;
  const customerId = typeof order.customerId === 'string' ? order.customerId.trim() : '';
  return customerId;
}

function hasDriverAssigned(order: OrderStageInput): boolean {
  const driverId = typeof order.driverId === 'string' ? order.driverId.trim() : '';
  const assigned =
    typeof order.assignedDriverId === 'string' ? order.assignedDriverId.trim() : '';
  return Boolean(driverId || assigned);
}

/**
 * Client-side mirror of Firestore customer cancel fast-path checks.
 * Logs which branch would reject before the write (rules cannot log).
 */
export function diagnoseCustomerCancelOrderWrite(
  order: OrderStageInput & {
    customerId?: unknown;
    userId?: unknown;
    driverId?: unknown;
    assignedDriverId?: unknown;
    paymentStatus?: unknown;
  },
  uid: string,
  patch: { status?: unknown; deliveryStatus?: unknown; cancelledBy?: unknown },
): CustomerCancelWriteDiagnostic {
  const stage = deriveOrderStage(order);
  const base = {
    orderStage: stage,
    firestoreRulePath: 'orders/{orderId} allow update → marketplaceOrderCustomerCancelFastPathOk',
  };

  const caller = uid.trim();
  if (!caller) {
    return { ...base, allowed: false, rejectBranch: 'auth:missing_uid' };
  }

  const owner = orderOwnerUid(order);
  if (owner !== caller) {
    return { ...base, allowed: false, rejectBranch: 'ownership:customerId_or_userId_mismatch' };
  }

  const kitchen = norm(order.status);
  const courier = norm(order.deliveryStatus);

  if (TERMINAL_KITCHEN.has(kitchen) || TERMINAL_KITCHEN.has(courier) || courier === 'cancelled') {
    return { ...base, allowed: false, rejectBranch: 'terminal:order_already_finished' };
  }

  if (hasDriverAssigned(order)) {
    return { ...base, allowed: false, rejectBranch: 'driver:assigned_before_cancel' };
  }

  if (BLOCKED_KITCHEN.has(kitchen) || BLOCKED_COURIER.has(courier)) {
    return { ...base, allowed: false, rejectBranch: 'stage:blocked_pickup_or_in_transit' };
  }

  if (!FIRESTORE_CUSTOMER_CANCELLABLE_STATUSES.has(kitchen)) {
    return {
      ...base,
      allowed: false,
      rejectBranch: `status:not_cancellable (${kitchen || 'empty'})`,
    };
  }

  if (norm(patch.status) !== 'cancelled') {
    return { ...base, allowed: false, rejectBranch: 'patch:status_must_be_cancelled' };
  }

  if (norm(patch.deliveryStatus) !== 'cancelled') {
    return { ...base, allowed: false, rejectBranch: 'patch:deliveryStatus_must_be_cancelled' };
  }

  if (typeof patch.cancelledBy === 'string' && patch.cancelledBy.trim() !== caller) {
    return { ...base, allowed: false, rejectBranch: 'patch:cancelledBy_must_match_caller' };
  }

  if (!canCustomerCancelMarketplaceOrder(order)) {
    return {
      ...base,
      allowed: false,
      rejectBranch: `client:canCustomerCancelMarketplaceOrder_false (stage=${stage})`,
    };
  }

  return { ...base, allowed: true, rejectBranch: null };
}

export function logCustomerCancelWriteDiagnostic(
  orderId: string,
  diagnostic: CustomerCancelWriteDiagnostic,
): void {
  if (diagnostic.allowed) {
    console.log('[CUSTOMER CANCEL ELIGIBLE]', {
      orderId,
      orderStage: diagnostic.orderStage,
      firestoreRulePath: diagnostic.firestoreRulePath,
    });
    return;
  }
  console.warn('[CUSTOMER CANCEL REJECTED]', {
    orderId,
    rejectBranch: diagnostic.rejectBranch,
    orderStage: diagnostic.orderStage,
    firestoreRulePath: diagnostic.firestoreRulePath,
    hint:
      diagnostic.rejectBranch?.startsWith('status:') ?
        'Update firestore.rules marketplaceOrderCustomerCancellableStatusOk'
      : diagnostic.rejectBranch?.startsWith('client:') ?
        'UI allows cancel but orderStage guard disagrees — check deriveOrderStage'
      : 'Check firestore.rules marketplaceOrderCustomerCancelFastPathOk',
  });
}
