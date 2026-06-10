import { isOrderCompleted } from '@/lib/orderCompletion';
import { deriveOrderStage, type OrderStageInput } from '@/services/orderStage';
import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';

/** Kitchen statuses that must never appear in active-order feeds. */
export const TERMINAL_KITCHEN_STATUSES = [
  'completed',
  'delivered',
  'cancelled',
  'rejected',
  'expired',
] as const;

/** Courier statuses that must never appear in active-order feeds. */
export const TERMINAL_DELIVERY_STATUSES = ['delivered', 'cancelled', 'completed'] as const;

/**
 * In-progress marketplace lifecycle statuses (customer / driver / restaurant active UIs).
 * Terminal rows are excluded via {@link isTerminalMarketplaceOrder}.
 */
export const ACTIVE_MARKETPLACE_STATUSES = [
  'awaiting_payment',
  'payment_processing',
  'payment_confirmed',
  'pending',
  'pending_driver',
  'accepted',
  'restaurant_accepted',
  'preparing',
  'ready',
  'ready_for_pickup',
  'driver_assigned',
  'driver_accepted',
  'arriving_restaurant',
  'picked_up',
  'on_the_way',
  'arrived_customer',
  'matched',
  'open',
  'active',
  'waiting',
  'full',
] as const;

export type TerminalOrderFields = OrderStageInput & {
  expired?: unknown;
  marketplaceArchived?: unknown;
  archivedByRestaurant?: unknown;
  hiddenForRestaurant?: unknown;
  completedAt?: unknown;
  completedAtMs?: number | null;
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** True when an order must not appear in any active-order screen or matching queue. */
export function isTerminalMarketplaceOrder(
  order: TerminalOrderFields | null | undefined,
): boolean {
  if (!order) return false;

  if (order.expired === true) return true;
  if (order.archivedByRestaurant === true || order.hiddenForRestaurant === true) {
    return true;
  }

  const kitchen = norm(order.status);
  const normalizedCourier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);

  if (kitchen === 'cancelled' || kitchen === 'rejected' || kitchen === 'expired') return true;
  if (normalizedCourier === 'cancelled') return true;

  if (isOrderCompleted(order)) return true;

  const stage = deriveOrderStage(order);
  return stage === 'cancelled';
}

/** Inverse helper for active-order queries and listeners. */
export function isActiveMarketplaceOrder(
  order: TerminalOrderFields | null | undefined,
): boolean {
  return !isTerminalMarketplaceOrder(order);
}

/** Single source of truth for marketplace order documents. */
export function orderDocumentPath(orderId: string): string {
  return `orders/${orderId.trim()}`;
}

export type StatusWriteMeta = {
  source?: string;
  previousDeliveryStatus?: unknown;
  newDeliveryStatus?: unknown;
  firestorePath?: string;
};

import { logOrderLifecycleTransition } from '@/lib/orderLifecycleTransitionLog';

/** Mandatory `[STATUS WRITE]` log before every lifecycle Firestore mutation (prod + dev). */
export function logStatusWrite(
  orderId: string,
  previousStatus: unknown,
  newStatus: unknown,
  meta?: StatusWriteMeta,
): void {
  const prev = previousStatus ?? null;
  const next = newStatus ?? null;
  const prevCourier = meta?.previousDeliveryStatus ?? null;
  const nextCourier = meta?.newDeliveryStatus ?? null;
  if (prev === next && prevCourier === nextCourier) return;

  const firestorePath = meta?.firestorePath ?? orderDocumentPath(orderId);
  logOrderLifecycleTransition(orderId, prev, next, {
    source: meta?.source ?? null,
    firestorePath,
    previousDeliveryStatus: prevCourier,
    newDeliveryStatus: nextCourier,
  });
  console.log('[STATUS WRITE]', {
    orderId,
    previousStatus: prev,
    newStatus: next,
    previousDeliveryStatus: prevCourier,
    newDeliveryStatus: nextCourier,
    firestorePath,
    source: meta?.source ?? null,
    timestamp: Date.now(),
  });
}

/** Customer / listener read trace — log on every applied `orders/{id}` snapshot. */
export function logStatusRead(
  orderId: string,
  deliveryStatus: unknown,
  status: unknown,
  meta?: { source?: string; fromCache?: boolean; hasPendingWrites?: boolean },
): void {
  console.log('[STATUS READ]', {
    orderId,
    deliveryStatus: deliveryStatus ?? null,
    status: status ?? null,
    source: meta?.source ?? null,
    fromCache: meta?.fromCache ?? null,
    hasPendingWrites: meta?.hasPendingWrites ?? null,
    timestamp: Date.now(),
  });
}

/** @deprecated Use {@link logStatusWrite} — kept for existing call sites. */
export function logOrderStatusTransition(
  orderId: string,
  previousStatus: unknown,
  newStatus: unknown,
  meta?: StatusWriteMeta,
): void {
  logStatusWrite(orderId, previousStatus, newStatus, meta);
}
