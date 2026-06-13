import {
  filterDriverActiveMarketplaceOrders,
  isDriverOrderTerminalForActiveList,
  type DriverHubOrderAssignment,
} from '@/lib/driverHubActiveOrders';
import { logQuerySource } from '@/lib/driverActiveOrderFilter';
import { MARKETPLACE_DELIVERY_STATUS } from '@/lib/orderStatus';
import type { ActiveDelivery } from '@/services/delivery';
import type { DriverOrder } from '@/services/driverService';

export type DriverHubOrderRemoveReason =
  | 'delivery_completed'
  | 'firestore_terminal'
  | 'listener_prune'
  | 'hub_optimistic'
  | 'active_screen_exit'
  | 'hub_card_deliver';

type ActiveOrderRemoveListener = (orderId: string, reason: DriverHubOrderRemoveReason) => void;
type CompletedBumpListener = (order: DriverOrder) => void;

const forceCompletedOrderIds = new Set<string>();
const activeDeliveryCache = new Map<string, ActiveDelivery>();
let activeRouteOrderId: string | null = null;

const activeRemoveListeners = new Set<ActiveOrderRemoveListener>();
const completedBumpListeners = new Set<CompletedBumpListener>();

export function isDriverHubOrderForceCompleted(orderId: string): boolean {
  return forceCompletedOrderIds.has(orderId.trim());
}

export function rememberDriverActiveDelivery(order: ActiveDelivery): void {
  activeDeliveryCache.set(order.id, order);
}

export function getCachedDriverActiveDelivery(
  orderId: string,
): ActiveDelivery | undefined {
  return activeDeliveryCache.get(orderId);
}

export function setDriverActiveRouteOrderId(orderId: string | null): void {
  activeRouteOrderId = orderId?.trim() || null;
}

export function getDriverActiveRouteOrderId(): string | null {
  return activeRouteOrderId;
}

export function clearDriverActiveRouteMemory(orderId: string, reason: string): void {
  const id = orderId.trim();
  if (activeRouteOrderId === id) {
    activeRouteOrderId = null;
    if (__DEV__) {
      console.log('[DRIVER ACTIVE ROUTE CLEARED]', { orderId: id, reason });
    }
  }
}

function logActiveOrdersRemove(orderId: string, reason: DriverHubOrderRemoveReason): void {
  console.log('[ACTIVE ORDERS REMOVE]', orderId, reason);
}

function logCurrentDeliveryCleared(orderId: string, reason: string): void {
  console.log('[CURRENT DELIVERY CLEARED]', orderId, reason);
}

export function subscribeDriverHubActiveOrderRemove(
  listener: ActiveOrderRemoveListener,
): () => void {
  activeRemoveListeners.add(listener);
  return () => {
    activeRemoveListeners.delete(listener);
  };
}

export function subscribeDriverHubCompletedBump(
  listener: CompletedBumpListener,
): () => void {
  completedBumpListeners.add(listener);
  return () => {
    completedBumpListeners.delete(listener);
  };
}

function toTerminalDriverOrder(order: DriverOrder): DriverOrder {
  return {
    ...order,
    status: 'completed',
    deliveryStatus: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
    deliveredAtMs: order.deliveredAtMs ?? Date.now(),
  };
}

/**
 * Immediately drop an order from hub active lists, active-delivery cache, and route memory.
 * Call as soon as delivery completes (do not wait for Firestore listener refresh).
 */
export function markDriverHubOrderCompleted(
  orderId: string,
  reason: DriverHubOrderRemoveReason,
  options?: { driverOrder?: DriverOrder | null; activeDelivery?: ActiveDelivery | null },
): void {
  const id = orderId.trim();
  if (!id) return;

  const wasNew = !forceCompletedOrderIds.has(id);
  forceCompletedOrderIds.add(id);
  activeDeliveryCache.delete(id);
  clearDriverActiveRouteMemory(id, reason);

  if (wasNew) {
    logCurrentDeliveryCleared(id, reason);
    logActiveOrdersRemove(id, reason);
    console.log('[ACTIVE DELIVERY CACHE CLEARED]', { orderId: id, reason });
    for (const listener of activeRemoveListeners) {
      listener(id, reason);
    }
  }

  const bump =
    options?.driverOrder != null
      ? toTerminalDriverOrder(options.driverOrder)
      : options?.activeDelivery != null
        ? driverOrderFromActiveDelivery(options.activeDelivery)
        : null;
  if (bump) {
    for (const listener of completedBumpListeners) {
      listener(bump);
    }
  }
}

function driverOrderFromActiveDelivery(row: ActiveDelivery): DriverOrder {
  return {
    id: row.id,
    groupId: null,
    restaurantId: null,
    deliveryStatus: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
    expired: false,
    placedLabel: '',
    restaurantName: row.restaurantName,
    restaurantImage: row.restaurantImage,
    restaurantAddress: row.restaurantAddress,
    items: row.items,
    subtotal: row.subtotal,
    deliveryFee: row.fees,
    total: row.payout,
    status: 'completed',
    customerName: row.customerName,
    customerAvatar: null,
    customerPhone: row.customerPhone,
    restaurantPhone: row.restaurantPhone,
    restaurantLat: row.restaurantLocation?.lat ?? null,
    restaurantLng: row.restaurantLocation?.lng ?? null,
    deliveryAddress: row.deliveryAddress,
    deliveryLat: row.customerLocation?.lat ?? null,
    deliveryLng: row.customerLocation?.lng ?? null,
    notes: row.notes,
    restaurantLocation: row.restaurantLocation,
    customerLocation: row.customerLocation,
    driverLocation: row.driverLocation,
    estimatedDeliveryTime: row.estimatedDurationMin,
    distanceKm: row.distanceKm,
    acceptedAtMs: row.acceptedAtMs,
    createdAtMs: row.createdAtMs,
    deliveredAtMs: row.deliveredAtMs ?? Date.now(),
    driverId: row.driverId,
    assignedDriverId: row.assignedDriverId,
    marketplaceArchived: true,
    earningsRecorded: true,
    updatedAtMs: row.deliveredAtMs ?? Date.now(),
  };
}

export function shouldDropHubActiveOrder(
  order: DriverHubOrderAssignment & { id?: string },
): boolean {
  const id = typeof order.id === 'string' ? order.id.trim() : '';
  if (id && isDriverHubOrderForceCompleted(id)) return true;
  return isDriverOrderTerminalForActiveList(order);
}

/** Hub + listeners: exclude force-completed and terminal rows. */
export function filterHubActiveDriverOrders<T extends DriverHubOrderAssignment & { id: string }>(
  orders: T[],
  driverUid: string,
): T[] {
  const kept = orders.filter((o) => !shouldDropHubActiveOrder(o));
  const result = filterDriverActiveMarketplaceOrders(kept, driverUid);
  for (const o of result) {
    logQuerySource(o.id, o.status, o.deliveryStatus, 'filterHubActiveDriverOrders', {
      firestorePath: `orders/${o.id}`,
      driverId: o.driverId,
      assignedDriverId: o.assignedDriverId,
      entersActiveList: true,
    });
  }
  return result;
}

export function pruneHubActiveOrdersState(
  orders: DriverOrder[],
  driverUid: string,
): DriverOrder[] {
  return filterHubActiveDriverOrders(orders, driverUid);
}
