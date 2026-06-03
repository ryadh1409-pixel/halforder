import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';

export type DriverHubOrderAssignment = {
  driverId?: string | null;
  assignedDriverId?: string | null;
  deliveryStatus?: unknown;
};

/** In-progress marketplace deliveries assigned to this driver (courier status, not kitchen `status`). */
export function isDriverActiveMarketplaceOrder(
  order: DriverHubOrderAssignment,
  driverUid: string,
): boolean {
  const uid = driverUid.trim();
  if (!uid) return false;
  const assigned = order.driverId === uid || order.assignedDriverId === uid;
  if (!assigned) return false;
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return (
    courier === MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED ||
    courier === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP ||
    courier === MARKETPLACE_DELIVERY_STATUS.PICKED_UP ||
    courier === MARKETPLACE_DELIVERY_STATUS.ACCEPTED ||
    courier === MARKETPLACE_DELIVERY_STATUS.PREPARING
  );
}
