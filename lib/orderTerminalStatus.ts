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

/** Mandatory log for every lifecycle status mutation (prod + dev). */
export function logOrderStatusTransition(
  orderId: string,
  previousStatus: unknown,
  newStatus: unknown,
  meta?: {
    source?: string;
    previousDeliveryStatus?: unknown;
    newDeliveryStatus?: unknown;
    firestorePath?: string;
  },
): void {
  const prev = previousStatus ?? null;
  const next = newStatus ?? null;
  const prevCourier = meta?.previousDeliveryStatus ?? null;
  const nextCourier = meta?.newDeliveryStatus ?? null;
  if (prev === next && prevCourier === nextCourier) return;

  const firestorePath = meta?.firestorePath ?? orderDocumentPath(orderId);
  console.log(orderId, prev, next, firestorePath);
  console.log('[ORDER STATUS TRANSITION]', {
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
