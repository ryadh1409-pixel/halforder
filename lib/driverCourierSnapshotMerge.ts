import type { ActiveDelivery } from '@/services/delivery';
import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
  type MarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import {
  evaluateSnapshotMergeDecision,
  logSnapshotMergeDecision,
} from '@/lib/orderSnapshotMergeDecision';

/** Sources that may feed the driver active-delivery screen. */
export type DriverOrderSnapshotSource =
  | 'active_delivery'
  | 'driver_orders'
  | 'cached_order'
  | 'marketplace_order';

/** Authoritative Firestore doc listener outranks list/cache subscriptions. */
export const DRIVER_SNAPSHOT_SOURCE_PRIORITY: Record<DriverOrderSnapshotSource, number> = {
  active_delivery: 100,
  driver_orders: 40,
  marketplace_order: 30,
  cached_order: 10,
};

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

type ActiveDeliveryCourierFields = Pick<
  ActiveDelivery,
  | 'marketplaceCourierStatus'
  | 'firestoreDeliveryStatus'
  | 'deliveredAtMs'
  | 'status'
>;

/** True when the order has completed marketplace delivery (any reliable signal). */
export function isEffectivelyDelivered(order: ActiveDeliveryCourierFields): boolean {
  if (order.marketplaceCourierStatus === MARKETPLACE_DELIVERY_STATUS.DELIVERED) {
    return true;
  }
  const raw = order.firestoreDeliveryStatus;
  if (raw === 'delivered' || raw === 'completed') return true;
  const kitchen = typeof order.status === 'string' ? order.status.trim().toLowerCase() : '';
  if (kitchen === 'completed' || kitchen === 'delivered') return true;
  const ms = order.deliveredAtMs;
  return ms != null && Number.isFinite(ms) && ms > 0;
}

/** Align courier field when kitchen/delivery timestamps say delivered but courier lags. */
export function withResolvedMarketplaceCourier(order: ActiveDelivery): ActiveDelivery {
  if (
    order.marketplaceCourierStatus === MARKETPLACE_DELIVERY_STATUS.DELIVERED ||
    !isEffectivelyDelivered(order)
  ) {
    return order;
  }
  return {
    ...order,
    marketplaceCourierStatus: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
    firestoreDeliveryStatus:
      order.firestoreDeliveryStatus === 'delivered'
        ? order.firestoreDeliveryStatus
        : 'delivered',
  };
}

function logDeliveredSnapshot(
  phase: 'received' | 'applied',
  source: DriverOrderSnapshotSource,
  order: ActiveDelivery,
  meta?: DriverOrderSnapshotLogMeta,
): void {
  console.log(
    phase === 'received' ? '[DELIVERED SNAPSHOT RECEIVED]' : '[DELIVERED SNAPSHOT APPLIED]',
    {
      source,
      orderId: order.id,
      deliveryStatus: order.marketplaceCourierStatus,
      firestoreDeliveryStatus: order.firestoreDeliveryStatus,
      status: order.status,
      deliveredAtMs: order.deliveredAtMs ?? null,
      updatedAt: order.updatedAtMs ?? null,
      fromCache: meta?.fromCache ?? false,
      hasPendingWrites: meta?.hasPendingWrites ?? false,
    },
  );
}

/**
 * Whether `incoming` may replace `current` for driver active-delivery UI.
 * Timestamp rules win; courier rank is only a tiebreaker when timestamps are equal/missing.
 */
export function shouldAcceptDriverCourierSnapshot(
  current: ActiveDelivery,
  incoming: ActiveDelivery,
  source: DriverOrderSnapshotSource = 'active_delivery',
): boolean {
  if (current.id !== incoming.id) return true;

  const incomingCourier = incoming.marketplaceCourierStatus;
  if (isTerminalCourierReset(incomingCourier)) return true;

  const incomingDelivered = isEffectivelyDelivered(incoming);
  const currentDelivered = isEffectivelyDelivered(current);

  if (incomingDelivered && !currentDelivered) return true;
  if (incomingDelivered && currentDelivered) return true;

  const decision = evaluateSnapshotMergeDecision(
    {
      deliveryStatus: current.marketplaceCourierStatus,
      updatedAtMs: current.updatedAtMs,
      label: 'local',
    },
    {
      deliveryStatus: incoming.marketplaceCourierStatus,
      updatedAtMs: incoming.updatedAtMs,
      label: 'remote',
    },
  );

  logSnapshotMergeDecision(
    'driver_courier',
    incoming.id,
    {
      deliveryStatus: current.marketplaceCourierStatus,
      updatedAtMs: current.updatedAtMs,
      label: 'local',
    },
    {
      deliveryStatus: incoming.marketplaceCourierStatus,
      updatedAtMs: incoming.updatedAtMs,
      label: 'remote',
    },
    decision,
    {
      source,
      keptDeliveryStatus: decision.accept ? incoming.marketplaceCourierStatus : current.marketplaceCourierStatus,
      rejectedDeliveryStatus: decision.accept ? current.marketplaceCourierStatus : incoming.marketplaceCourierStatus,
      keptUpdatedAt: decision.accept ? incoming.updatedAtMs ?? null : current.updatedAtMs ?? null,
      rejectedUpdatedAt: decision.accept ? current.updatedAtMs ?? null : incoming.updatedAtMs ?? null,
    },
  );

  return decision.accept;
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
  const resolved = withResolvedMarketplaceCourier(incoming);
  logDriverOrderSnapshot(source, resolved, meta);

  if (!current) {
    if (isEffectivelyDelivered(resolved)) {
      logDeliveredSnapshot('received', source, resolved, meta);
      logDeliveredSnapshot('applied', source, resolved, meta);
    }
    return resolved;
  }
  if (current.id !== resolved.id) {
    return resolved;
  }

  if (isEffectivelyDelivered(resolved)) {
    logDeliveredSnapshot('received', source, resolved, meta);
  }

  if (shouldAcceptDriverCourierSnapshot(current, resolved, source)) {
    if (isEffectivelyDelivered(resolved)) {
      logDeliveredSnapshot('applied', source, resolved, meta);
    }
    if (
      current.marketplaceCourierStatus !== resolved.marketplaceCourierStatus ||
      resolveUpdatedAtMs(current) !== resolveUpdatedAtMs(resolved)
    ) {
      console.log('[DRIVER ORDER SNAPSHOT] applied', {
        source,
        orderId: resolved.id,
        from: current.marketplaceCourierStatus,
        to: resolved.marketplaceCourierStatus,
        fromUpdatedAt: current.updatedAtMs ?? null,
        toUpdatedAt: resolved.updatedAtMs ?? null,
      });
    }
    return resolved;
  }

  console.log('[DRIVER ORDER SNAPSHOT] ignored stale', {
    source,
    orderId: resolved.id,
    keptDeliveryStatus: current.marketplaceCourierStatus,
    rejectedDeliveryStatus: resolved.marketplaceCourierStatus,
    keptUpdatedAt: current.updatedAtMs ?? null,
    rejectedUpdatedAt: resolved.updatedAtMs ?? null,
    fromCache: meta?.fromCache ?? false,
  });
  return null;
}

/** Pick the freshest row when several sources hold the same order id. */
export function pickFreshestActiveDelivery(rows: ActiveDelivery[]): ActiveDelivery | null {
  if (!rows.length) return null;
  let best = withResolvedMarketplaceCourier(rows[0]);
  for (let i = 1; i < rows.length; i += 1) {
    const candidate = withResolvedMarketplaceCourier(rows[i]);
    if (shouldAcceptDriverCourierSnapshot(best, candidate, 'active_delivery')) {
      best = candidate;
      continue;
    }
    if (shouldAcceptDriverCourierSnapshot(candidate, best, 'active_delivery')) {
      best = candidate;
    }
  }
  return best;
}
