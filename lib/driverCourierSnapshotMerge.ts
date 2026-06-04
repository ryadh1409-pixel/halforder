import type { ActiveDelivery } from '@/services/delivery';
import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
  type MarketplaceDeliveryStatus,
} from '@/lib/orderStatus';

/** Sources that may feed the driver active-delivery screen. */
export type DriverOrderSnapshotSource =
  | 'active_delivery'
  | 'driver_orders'
  | 'cached_order'
  | 'marketplace_order';

/** Driver marketplace courier steps — only forward along this chain. */
const DRIVER_COURIER_FORWARD_RANK: Partial<Record<MarketplaceDeliveryStatus, number>> = {
  [MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED]: 10,
  [MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP]: 20,
  [MARKETPLACE_DELIVERY_STATUS.PICKED_UP]: 30,
  [MARKETPLACE_DELIVERY_STATUS.DELIVERED]: 40,
};

export function driverCourierForwardRank(status: unknown): number {
  const normalized = normalizeMarketplaceDeliveryStatus(status);
  return DRIVER_COURIER_FORWARD_RANK[normalized] ?? 0;
}

export type DriverOrderSnapshotLogMeta = {
  fromCache?: boolean;
  hasPendingWrites?: boolean;
};

export function logDriverOrderSnapshot(
  source: DriverOrderSnapshotSource,
  order: Pick<ActiveDelivery, 'id' | 'marketplaceCourierStatus' | 'updatedAtMs'>,
  meta?: DriverOrderSnapshotLogMeta,
): void {
  console.log('[DRIVER ORDER SNAPSHOT]', {
    source,
    orderId: order.id,
    deliveryStatus: order.marketplaceCourierStatus,
    updatedAt: order.updatedAtMs ?? null,
    fromCache: meta?.fromCache ?? false,
    hasPendingWrites: meta?.hasPendingWrites ?? false,
  });
}

function resolveUpdatedAtMs(order: Pick<ActiveDelivery, 'updatedAtMs'>): number {
  const ms = order.updatedAtMs;
  return ms != null && Number.isFinite(ms) ? ms : 0;
}

function isTerminalCourierReset(status: MarketplaceDeliveryStatus): boolean {
  return status === MARKETPLACE_DELIVERY_STATUS.CANCELLED;
}

/**
 * Whether `incoming` may replace `current` for driver active-delivery UI.
 * Courier never regresses along driver_assigned → ready_for_pickup → picked_up → delivered.
 * When rank is equal, prefer the snapshot with the newer `updatedAt`.
 */
export function shouldAcceptDriverCourierSnapshot(
  current: ActiveDelivery,
  incoming: ActiveDelivery,
): boolean {
  if (current.id !== incoming.id) return true;

  const incomingCourier = incoming.marketplaceCourierStatus;
  if (isTerminalCourierReset(incomingCourier)) return true;

  const curRank = driverCourierForwardRank(current.marketplaceCourierStatus);
  const incRank = driverCourierForwardRank(incomingCourier);

  if (incRank > curRank) return true;
  if (incRank < curRank) return false;

  const curMs = resolveUpdatedAtMs(current);
  const incMs = resolveUpdatedAtMs(incoming);
  if (curMs === 0 || incMs === 0) return true;
  return incMs >= curMs;
}

/**
 * Merge an incoming listener snapshot into committed driver active-delivery state.
 * @returns merged order, or `null` when the snapshot is stale and should be ignored.
 */
export function reconcileActiveDeliverySnapshot(
  current: ActiveDelivery | null,
  incoming: ActiveDelivery,
  source: DriverOrderSnapshotSource,
  meta?: DriverOrderSnapshotLogMeta,
): ActiveDelivery | null {
  logDriverOrderSnapshot(source, incoming, meta);

  if (!current) {
    return incoming;
  }
  if (current.id !== incoming.id) {
    return incoming;
  }

  if (shouldAcceptDriverCourierSnapshot(current, incoming)) {
    if (
      current.marketplaceCourierStatus !== incoming.marketplaceCourierStatus ||
      resolveUpdatedAtMs(current) !== resolveUpdatedAtMs(incoming)
    ) {
      console.log('[DRIVER ORDER SNAPSHOT] applied', {
        source,
        orderId: incoming.id,
        from: current.marketplaceCourierStatus,
        to: incoming.marketplaceCourierStatus,
        fromUpdatedAt: current.updatedAtMs ?? null,
        toUpdatedAt: incoming.updatedAtMs ?? null,
      });
    }
    return incoming;
  }

  console.log('[DRIVER ORDER SNAPSHOT] ignored stale', {
    source,
    orderId: incoming.id,
    keptDeliveryStatus: current.marketplaceCourierStatus,
    rejectedDeliveryStatus: incoming.marketplaceCourierStatus,
    keptUpdatedAt: current.updatedAtMs ?? null,
    rejectedUpdatedAt: incoming.updatedAtMs ?? null,
    fromCache: meta?.fromCache ?? false,
  });
  return null;
}

/** Pick the freshest row when several sources hold the same order id. */
export function pickFreshestActiveDelivery(rows: ActiveDelivery[]): ActiveDelivery | null {
  if (!rows.length) return null;
  let best = rows[0];
  for (let i = 1; i < rows.length; i += 1) {
    const candidate = rows[i];
    if (shouldAcceptDriverCourierSnapshot(best, candidate)) {
      best = candidate;
      continue;
    }
    if (shouldAcceptDriverCourierSnapshot(candidate, best)) {
      best = candidate;
    }
  }
  return best;
}
