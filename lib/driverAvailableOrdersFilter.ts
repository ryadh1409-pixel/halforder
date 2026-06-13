import { logQuerySource } from '@/lib/driverActiveOrderFilter';

export type DriverAvailableOrderInput = {
  id?: string;
  driverId?: string | null;
  assignedDriverId?: string | null;
  status?: unknown;
  deliveryStatus?: unknown;
};

/** Optimistic exclusion until Firestore pool + assigned listeners catch up. */
const locallyClaimedOrderIds = new Set<string>();

export function markDriverMarketplaceOrderClaimed(orderId: string): void {
  const id = orderId.trim();
  if (id) locallyClaimedOrderIds.add(id);
}

export function isDriverMarketplaceOrderLocallyClaimed(orderId: string): boolean {
  return locallyClaimedOrderIds.has(orderId.trim());
}

export function clearDriverMarketplaceOrderClaimed(orderId: string): void {
  locallyClaimedOrderIds.delete(orderId.trim());
}

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasNonEmptyDriverField(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** True when kitchen or courier status is past the claimable pool window. */
function isAssignedLifecycleStatus(status: string, deliveryStatus: string): boolean {
  return (
    status === 'driver_assigned' ||
    deliveryStatus === 'driver_assigned' ||
    status === 'picked_up' ||
    deliveryStatus === 'picked_up' ||
    status === 'delivered' ||
    deliveryStatus === 'delivered'
  );
}

/**
 * Driver marketplace pool rows must be unassigned and pre-fulfillment.
 * Checks raw Firestore fields — pool docs may omit assignment until sync deletes them.
 */
export function isDriverMarketplaceOrderAvailableForClaim(
  order: DriverAvailableOrderInput | null | undefined,
): boolean {
  if (!order) return false;
  const id = typeof order.id === 'string' ? order.id.trim() : '';
  if (id && isDriverMarketplaceOrderLocallyClaimed(id)) return false;
  if (hasNonEmptyDriverField(order.driverId)) return false;
  if (hasNonEmptyDriverField(order.assignedDriverId)) return false;

  const status = norm(order.status);
  const deliveryStatus = norm(order.deliveryStatus);
  if (isAssignedLifecycleStatus(status, deliveryStatus)) return false;

  return true;
}

export function filterDriverAvailableMarketplaceOrders<
  T extends DriverAvailableOrderInput & { id?: string },
>(orders: T[], queryName = 'filterDriverAvailableMarketplaceOrders'): T[] {
  return orders.filter((order) => {
    const kept = isDriverMarketplaceOrderAvailableForClaim(order);
    const id = typeof order.id === 'string' ? order.id.trim() : '';
    if (id) {
      logQuerySource(id, order.status, order.deliveryStatus, queryName, {
        firestorePath: `orders/${id}`,
        driverId: order.driverId,
        assignedDriverId: order.assignedDriverId,
        entersActiveList: false,
      });
      if (!kept) {
        console.log('[AVAILABLE FILTER]', {
          orderId: id,
          status: order.status ?? null,
          deliveryStatus: order.deliveryStatus ?? null,
          driverId: order.driverId ?? null,
          assignedDriverId: order.assignedDriverId ?? null,
          locallyClaimed: isDriverMarketplaceOrderLocallyClaimed(id),
          kept: false,
          queryName,
        });
      }
    }
    return kept;
  });
}

/** Exclude order ids already assigned to any driver (live orders/{id} listeners). */
export function excludeAssignedOrderIdsFromAvailable<
  T extends { id: string },
>(available: T[], assignedOrderIds: ReadonlySet<string>): T[] {
  if (assignedOrderIds.size === 0) return available;
  return available.filter((o) => !assignedOrderIds.has(o.id));
}

/** Prevent the same order id from rendering in Current delivery and Available orders. */
export function excludeActiveOrderIdsFromAvailable<
  T extends { id: string },
>(available: T[], active: Array<{ id: string }>): T[] {
  if (active.length === 0) return available;
  const activeIds = new Set(active.map((o) => o.id));
  return available.filter((o) => !activeIds.has(o.id));
}

/** Filter a pool snapshot using raw Firestore fields before mapping. */
export function isDriverMarketplacePoolDocAvailable(
  orderId: string,
  raw: Record<string, unknown>,
): boolean {
  return isDriverMarketplaceOrderAvailableForClaim({
    id: orderId,
    driverId: typeof raw.driverId === 'string' ? raw.driverId : null,
    assignedDriverId:
      typeof raw.assignedDriverId === 'string' ? raw.assignedDriverId : null,
    status: raw.status,
    deliveryStatus: raw.deliveryStatus,
  });
}
