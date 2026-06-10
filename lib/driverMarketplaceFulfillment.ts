import {
  MARKETPLACE_DELIVERY_STATUS,
  marketplaceDeliveryStatusLabel,
  normalizeMarketplaceDeliveryStatus,
  type MarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import { calculateOrderPayout } from '@/lib/driverEarnings';
import { markDriverHubOrderCompleted } from '@/lib/driverHubOrdersStore';
import { isTerminalMarketplaceOrder, logStatusWrite, orderDocumentPath } from '@/lib/orderTerminalStatus';
import { clearOrderStageLock } from '@/lib/orderStageLock';
import { clearOrderListenerCommitCache } from '@/lib/orderListenerCommit';
import { db } from '@/services/firebase';
import { protectedUpdateOrder } from '@/services/orderFirestoreWrite';
import type { OrderStageInput } from '@/services/orderStage';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';

export type DriverMarketplaceFulfillmentAction = 'arrive_restaurant' | 'pickup' | 'deliver';

export type DriverMarketplaceFulfillmentView = OrderStageInput & {
  driverId?: unknown;
  assignedDriverId?: unknown;
  totalPrice?: unknown;
  deliveryFee?: unknown;
  fees?: unknown;
};

export type DriverMarketplaceFulfillmentButton = {
  label: string;
  action: DriverMarketplaceFulfillmentAction;
};

function normCourier(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isAssignedToDriver(order: DriverMarketplaceFulfillmentView, driverUid: string): boolean {
  const uid = driverUid.trim();
  if (!uid) return false;
  const driverId = typeof order.driverId === 'string' ? order.driverId.trim() : '';
  const assigned =
    typeof order.assignedDriverId === 'string' ? order.assignedDriverId.trim() : '';
  return driverId === uid || assigned === uid;
}

/** Courier statuses where the restaurant has released the order for driver pickup. */
function isReadyForDriverPickup(courier: MarketplaceDeliveryStatus, raw: string): boolean {
  if (courier === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP) return true;
  return raw === 'ready' || raw === 'waiting_driver' || raw === 'accepted_for_delivery';
}

/** True when assigned driver has finished this marketplace delivery. */
export function isDriverMarketplaceDeliveryComplete(
  order: DriverMarketplaceFulfillmentView | null | undefined,
  driverUid: string | null | undefined,
): boolean {
  if (!order || !driverUid?.trim() || !isAssignedToDriver(order, driverUid)) {
    return false;
  }
  return (
    normalizeMarketplaceDeliveryStatus(order.deliveryStatus) ===
    MARKETPLACE_DELIVERY_STATUS.DELIVERED
  );
}

/**
 * UberEats-style primary action for assigned marketplace deliveries.
 * driver_assigned → ready_for_pickup → picked_up → delivered
 */
export function getDriverMarketplaceFulfillmentButton(
  order: DriverMarketplaceFulfillmentView | null | undefined,
  driverUid: string | null | undefined,
): DriverMarketplaceFulfillmentButton | null {
  if (!order || !driverUid?.trim() || !isAssignedToDriver(order, driverUid)) {
    return null;
  }
  const raw = normCourier(order.deliveryStatus);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);

  if (courier === MARKETPLACE_DELIVERY_STATUS.DELIVERED) {
    return null;
  }
  if (courier === MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED) {
    return { label: 'Arrived at Restaurant', action: 'arrive_restaurant' };
  }
  if (isReadyForDriverPickup(courier, raw)) {
    return { label: 'Confirm Pickup', action: 'pickup' };
  }
  if (courier === MARKETPLACE_DELIVERY_STATUS.PICKED_UP) {
    return { label: 'Complete Delivery', action: 'deliver' };
  }
  return null;
}

/** Driver Hub status line for assigned active deliveries. */
export function driverHubActiveStatusLabel(deliveryStatus: unknown): string {
  const courier = normalizeMarketplaceDeliveryStatus(deliveryStatus);
  if (courier === MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED) {
    return 'Waiting for restaurant';
  }
  if (courier === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP) {
    return 'Ready for pickup';
  }
  if (courier === MARKETPLACE_DELIVERY_STATUS.PICKED_UP) {
    return 'Out for delivery';
  }
  return marketplaceDeliveryStatusLabel(deliveryStatus);
}

export function driverMarketplaceFulfillmentStatusHint(
  order: DriverMarketplaceFulfillmentView | null | undefined,
  driverUid: string | null | undefined,
): string | null {
  if (!order || !driverUid?.trim() || !isAssignedToDriver(order, driverUid)) {
    return null;
  }
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  if (courier === MARKETPLACE_DELIVERY_STATUS.DELIVERED) {
    return 'Delivery completed.';
  }
  return null;
}

function buildFulfillmentPatch(
  action: DriverMarketplaceFulfillmentAction,
  current?: DriverMarketplaceFulfillmentView,
): Record<string, unknown> {
  if (action === 'arrive_restaurant') {
    return {
      deliveryStatus: MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
      status: 'ready_for_pickup',
      updatedBy: 'driverMarketplaceArrivedRestaurant',
    };
  }
  if (action === 'pickup') {
    return {
      deliveryStatus: MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
      status: 'picked_up',
      pickedUpAt: serverTimestamp(),
      updatedBy: 'driverMarketplacePickup',
    };
  }
  const payout = calculateOrderPayout({
    totalPrice: current?.totalPrice,
    deliveryFee: current?.deliveryFee,
    fees: current?.fees,
  });
  return {
    deliveryStatus: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
    status: 'completed',
    deliveredAt: serverTimestamp(),
    completedAt: serverTimestamp(),
    marketplaceArchived: true,
    earningsRecorded: true,
    customerTotal: payout.customerTotal,
    driverPayout: payout.driverPayout,
    platformFee: payout.platformFee,
    updatedAt: serverTimestamp(),
    updatedBy: 'driverMarketplaceDelivered',
  };
}

async function loadFulfillmentView(
  orderId: string,
  seed?: DriverMarketplaceFulfillmentView | null,
): Promise<DriverMarketplaceFulfillmentView> {
  if (
    seed &&
    (seed.deliveryStatus !== undefined ||
      seed.status !== undefined ||
      seed.driverId !== undefined ||
      seed.assignedDriverId !== undefined)
  ) {
    return { id: orderId, ...seed };
  }
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) {
    throw new Error('Order not found');
  }
  return { id: orderId, ...(snap.data() as Record<string, unknown>) };
}

function isDuplicateFulfillment(
  current: DriverMarketplaceFulfillmentView,
  patch: Record<string, unknown>,
): boolean {
  const next = normCourier(patch.deliveryStatus);
  if (!next) return false;
  return normCourier(current.deliveryStatus) === next;
}

function isLegalFulfillment(
  current: DriverMarketplaceFulfillmentView,
  action: DriverMarketplaceFulfillmentAction,
): boolean {
  const raw = normCourier(current.deliveryStatus);
  const courier = normalizeMarketplaceDeliveryStatus(current.deliveryStatus);
  if (action === 'arrive_restaurant') {
    return courier === MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED;
  }
  if (action === 'pickup') {
    return isReadyForDriverPickup(courier, raw);
  }
  return courier === MARKETPLACE_DELIVERY_STATUS.PICKED_UP;
}

export async function applyDriverMarketplaceFulfillment(
  orderId: string,
  action: DriverMarketplaceFulfillmentAction,
  seedCurrent?: DriverMarketplaceFulfillmentView | null,
): Promise<'applied' | 'skipped_duplicate' | 'skipped_illegal'> {
  const id = orderId.trim();
  if (!id) throw new Error('Order id is required');

  const current = await loadFulfillmentView(
    id,
    action === 'deliver' ? null : seedCurrent,
  );

  if (isTerminalMarketplaceOrder(current)) {
    if (action === 'deliver') {
      markDriverHubOrderCompleted(id, 'delivery_completed', {
        driverOrder: null,
      });
    }
    return 'skipped_duplicate';
  }

  if (!isLegalFulfillment(current, action)) {
    console.warn('[DRIVER FULFILLMENT] rejected illegal transition', {
      orderId: id,
      action,
      deliveryStatus: current.deliveryStatus ?? null,
    });
    return 'skipped_illegal';
  }

  const patch = buildFulfillmentPatch(action, current);
  if (isDuplicateFulfillment(current, patch)) {
    console.log('[DRIVER FULFILLMENT] skipped duplicate transition', {
      orderId: id,
      action,
      deliveryStatus: patch.deliveryStatus,
    });
    return 'skipped_duplicate';
  }

  console.log('[DRIVER FULFILLMENT]', {
    orderId: id,
    action,
    currentDeliveryStatus: current.deliveryStatus ?? null,
    nextDeliveryStatus: patch.deliveryStatus,
    timestamp: Date.now(),
  });

  const wrote = await protectedUpdateOrder(id, patch, {
    fileName: 'driverMarketplaceFulfillment.ts',
    functionName: `applyDriverMarketplaceFulfillment:${action}`,
  });
  if (wrote) {
    logStatusWrite(id, current.status ?? null, patch.status ?? current.status ?? null, {
      source: `driverMarketplaceFulfillment:${action}`,
      firestorePath: orderDocumentPath(id),
      previousDeliveryStatus: current.deliveryStatus ?? null,
      newDeliveryStatus: patch.deliveryStatus ?? current.deliveryStatus ?? null,
    });
  }
  if (action === 'deliver') {
    if (wrote) {
      clearOrderStageLock(id);
      clearOrderListenerCommitCache(id);
      markDriverHubOrderCompleted(id, 'delivery_completed');
    } else {
      console.warn('[DRIVER FULFILLMENT] deliver write skipped — hub stays until Firestore confirms', {
        orderId: id,
      });
      return 'skipped_duplicate';
    }
  }
  return wrote ? 'applied' : 'skipped_duplicate';
}
