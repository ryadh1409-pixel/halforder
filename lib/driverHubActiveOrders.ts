import {
  driverCourierForwardRank,
  isEffectivelyDelivered,
} from '@/lib/driverCourierSnapshotMerge';
import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';

export type DriverHubOrderAssignment = {
  driverId?: string | null;
  assignedDriverId?: string | null;
  deliveryStatus?: unknown;
  status?: unknown;
  deliveredAtMs?: number | null;
};

/** True when kitchen or courier fields indicate a finished delivery. */
export function isDriverOrderTerminalForActiveList(
  order: DriverHubOrderAssignment,
): boolean {
  const kitchen =
    typeof order.status === 'string' ? order.status.trim().toLowerCase() : '';
  if (kitchen === 'completed' || kitchen === 'delivered') return true;

  const raw =
    typeof order.deliveryStatus === 'string'
      ? order.deliveryStatus.trim().toLowerCase()
      : '';
  if (raw === 'delivered' || raw === 'completed') return true;

  const kitchenStatus =
    typeof order.status === 'string' ? order.status : '';
  return isEffectivelyDelivered({
    marketplaceCourierStatus: normalizeMarketplaceDeliveryStatus(order.deliveryStatus),
    firestoreDeliveryStatus: raw,
    status: kitchenStatus,
    deliveredAtMs: order.deliveredAtMs ?? null,
  });
}

/** In-progress marketplace deliveries assigned to this driver (excludes delivered/completed). */
export function isDriverActiveMarketplaceOrder(
  order: DriverHubOrderAssignment,
  driverUid: string,
): boolean {
  const uid = driverUid.trim();
  if (!uid) return false;
  const assigned = order.driverId === uid || order.assignedDriverId === uid;
  if (!assigned) return false;
  if (isDriverOrderTerminalForActiveList(order)) return false;
  if (isDriverCompletedMarketplaceOrder(order, driverUid)) return false;

  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return (
    courier === MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED ||
    courier === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP ||
    courier === MARKETPLACE_DELIVERY_STATUS.PICKED_UP ||
    courier === MARKETPLACE_DELIVERY_STATUS.ACCEPTED ||
    courier === MARKETPLACE_DELIVERY_STATUS.PREPARING
  );
}

export function filterDriverActiveMarketplaceOrders<T extends DriverHubOrderAssignment>(
  orders: T[],
  driverUid: string,
): T[] {
  return orders.filter((o) => isDriverActiveMarketplaceOrder(o, driverUid));
}

/** Driver Hub shows one current delivery — highest courier stage wins. */
export function pickPrimaryDriverHubActiveOrder<T extends DriverHubOrderAssignment & { id?: string; createdAtMs?: number | null }>(
  orders: T[],
  driverUid: string,
): T[] {
  const active = filterDriverActiveMarketplaceOrders(orders, driverUid);
  if (active.length <= 1) return active;

  const ranked = [...active].sort((a, b) => {
    const rankA = driverCourierForwardRank(a.deliveryStatus);
    const rankB = driverCourierForwardRank(b.deliveryStatus);
    if (rankA !== rankB) return rankB - rankA;
    return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
  });
  return [ranked[0]];
}

function isAssignedToDriver(
  order: DriverHubOrderAssignment,
  driverUid: string,
): boolean {
  const uid = driverUid.trim();
  if (!uid) return false;
  return order.driverId === uid || order.assignedDriverId === uid;
}

/** Finished marketplace deliveries for this driver (hub history + stats). */
export function isDriverCompletedMarketplaceOrder(
  order: DriverHubOrderAssignment,
  driverUid: string,
): boolean {
  if (!isAssignedToDriver(order, driverUid)) return false;
  const kitchenStatus =
    typeof order.status === 'string' ? order.status : '';
  return isEffectivelyDelivered({
    marketplaceCourierStatus: normalizeMarketplaceDeliveryStatus(order.deliveryStatus),
    firestoreDeliveryStatus:
      typeof order.deliveryStatus === 'string' ? order.deliveryStatus.trim().toLowerCase() : '',
    status: kitchenStatus,
    deliveredAtMs: order.deliveredAtMs ?? null,
  });
}
