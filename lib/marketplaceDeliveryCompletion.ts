import { calculateOrderPayout } from '@/lib/driverEarnings';
import { MARKETPLACE_DELIVERY_STATUS } from '@/lib/orderStatus';
import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  protectedUpdateOrder,
  type OrderWriteSource,
} from '@/services/orderFirestoreWrite';
import { serverTimestamp } from 'firebase/firestore';

export type MarketplaceDeliveryCompletionInput = {
  totalPrice?: unknown;
  total?: unknown;
  deliveryFee?: unknown;
  fees?: unknown;
};

/** Canonical terminal fields for every marketplace delivery completion write. */
export function buildMarketplaceDeliveryCompletionPatch(
  order: MarketplaceDeliveryCompletionInput,
  updatedBy: string,
): Record<string, unknown> {
  const payout = calculateOrderPayout({
    totalPrice: order.totalPrice ?? order.total,
    deliveryFee: order.deliveryFee,
    fees: order.fees,
  });
  return {
    status: 'completed',
    deliveryStatus: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
    deliveredAt: serverTimestamp(),
    completedAt: serverTimestamp(),
    marketplaceArchived: true,
    earningsRecorded: true,
    customerTotal: payout.customerTotal,
    driverPayout: payout.driverPayout,
    platformFee: payout.platformFee,
    updatedAt: serverTimestamp(),
    updatedBy,
  };
}

export function logDeliveryCompletionBefore(
  orderId: string,
  current: Record<string, unknown>,
  source: string,
): void {
  console.log('[DELIVERY COMPLETE] before', {
    orderId,
    source,
    status: current.status ?? null,
    deliveryStatus: current.deliveryStatus ?? null,
    marketplaceArchived: current.marketplaceArchived ?? null,
    earningsRecorded: current.earningsRecorded ?? null,
    completedAt: current.completedAt ?? null,
    deliveredAt: current.deliveredAt ?? null,
  });
}

export function logDeliveryCompletionAfter(
  orderId: string,
  patch: Record<string, unknown>,
  source: string,
  wrote: boolean,
): void {
  console.log('[DELIVERY COMPLETE] after', {
    orderId,
    source,
    wrote,
    status: patch.status ?? null,
    deliveryStatus: patch.deliveryStatus ?? null,
    marketplaceArchived: patch.marketplaceArchived ?? null,
    earningsRecorded: patch.earningsRecorded ?? null,
    completedAt: patch.completedAt != null ? 'serverTimestamp' : null,
    deliveredAt: patch.deliveredAt != null ? 'serverTimestamp' : null,
  });
}

/** True when a patch would rewind a terminal marketplace delivery. */
export function patchRegressesTerminalDelivery(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  const terminal =
    isOrderCompleted(current) ||
    current.marketplaceArchived === true ||
    current.earningsRecorded === true;
  if (!terminal) return false;

  const preAssignmentKitchen = new Set([
    'awaiting_payment',
    'pending_payment',
    'payment_processing',
    'payment_failed',
    'pending',
    'payment_confirmed',
    'pending_driver',
    'accepted',
    'restaurant_accepted',
    'preparing',
    'ready_for_pickup',
    'driver_assigned',
    'driver_accepted',
    'picked_up',
  ]);
  const preDeliveryCourier = new Set([
    'pending',
    'driver_assigned',
    'ready_for_pickup',
    'ready',
    'waiting_driver',
    'picked_up',
    'on_the_way',
    'near_customer',
    'heading_to_restaurant',
    'arrived_restaurant',
  ]);

  if (patch.status !== undefined) {
    const next =
      typeof patch.status === 'string' ? patch.status.trim().toLowerCase() : '';
    if (next && preAssignmentKitchen.has(next)) return true;
  }
  if (patch.deliveryStatus !== undefined) {
    const next =
      typeof patch.deliveryStatus === 'string'
        ? patch.deliveryStatus.trim().toLowerCase()
        : '';
    if (next && preDeliveryCourier.has(next)) return true;
  }
  if (patch.marketplaceArchived === false) return true;
  if (patch.earningsRecorded === false) return true;
  return false;
}

/**
 * Single guarded Firestore completion write for driver marketplace deliveries.
 * Logs before and after every completion mutation.
 */
export async function writeMarketplaceDeliveryCompletion(
  orderId: string,
  current: Record<string, unknown>,
  source: OrderWriteSource,
  updatedBy: string,
): Promise<boolean> {
  const id = orderId.trim();
  const sourceLabel = `${source.fileName}#${source.functionName}`;
  logDeliveryCompletionBefore(id, current, sourceLabel);

  if (
    isOrderCompleted(current) ||
    current.marketplaceArchived === true ||
    current.earningsRecorded === true
  ) {
    logDeliveryCompletionAfter(id, {}, sourceLabel, false);
    return false;
  }

  const patch = buildMarketplaceDeliveryCompletionPatch(current, updatedBy);
  const wrote = await protectedUpdateOrder(id, patch, source);
  logDeliveryCompletionAfter(id, patch, sourceLabel, wrote);
  return wrote;
}
