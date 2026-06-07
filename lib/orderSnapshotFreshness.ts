import { resolveCustomerCourierRank } from '@/lib/customerCourierRank';
import { isOrderCompleted } from '@/lib/orderCompletion';
import { safeToMillis } from '@/utils/safeToMillis';

export type OrderSnapshotMeta = {
  fromCache: boolean;
  hasPendingWrites: boolean;
};

/** Document `updatedAt` only — used for monotonic snapshot ordering. */
export function resolveOrderUpdatedAtMs(raw: Record<string, unknown>): number {
  return Math.max(
    safeToMillis(raw.updatedAt) ?? 0,
    safeToMillis(raw.updatedAtMs) ?? 0,
  );
}

/** Best-effort monotonic freshness for lifecycle fields on `orders/{id}` — logging only. */
export function resolveOrderFreshnessMs(raw: Record<string, unknown>): number {
  return Math.max(
    resolveOrderUpdatedAtMs(raw),
    safeToMillis(raw.completedAt) ?? 0,
    safeToMillis(raw.completedAtMs) ?? 0,
    safeToMillis(raw.deliveredAt) ?? 0,
    safeToMillis(raw.deliveredAtMs) ?? 0,
    safeToMillis(raw.pickedUpAt) ?? 0,
    safeToMillis(raw.pickedUpAtMs) ?? 0,
  );
}

export function logServerOrCacheOrder(
  orderId: string,
  raw: Record<string, unknown>,
  meta: OrderSnapshotMeta,
  source?: string,
): void {
  const label = meta.fromCache ? 'CACHE ORDER' : 'SERVER ORDER';
  console.log(label, {
    orderId,
    source: source ?? null,
    status: raw.status ?? null,
    deliveryStatus: raw.deliveryStatus ?? null,
    updatedAtMs: resolveOrderUpdatedAtMs(raw) || null,
    deliveryStageRank: resolveCustomerCourierRank(raw),
    fromCache: meta.fromCache,
    hasPendingWrites: meta.hasPendingWrites,
  });
}

export type SnapshotFreshnessDecision = {
  apply: boolean;
  reason: string;
};

export type CustomerSnapshotState = {
  lastCourierRank: number;
  lastUpdatedAtMs: number;
  hasServerSnapshot: boolean;
  completionLocked: boolean;
  currentStatus?: unknown;
  currentDeliveryStatus?: unknown;
};

/**
 * Compare incoming snapshot against the best-known customer state.
 *
 * Rules:
 * - Never allow older `updatedAt` to overwrite newer `updatedAt`
 * - Equal `updatedAt`: never allow lower delivery rank to overwrite higher rank
 * - Terminal lock: delivered/completed cannot regress
 */
export function evaluateCustomerSnapshotFreshness(
  raw: Record<string, unknown>,
  meta: OrderSnapshotMeta,
  state: CustomerSnapshotState,
): SnapshotFreshnessDecision {
  const updatedAtMs = resolveOrderUpdatedAtMs(raw);
  const rank = resolveCustomerCourierRank(raw);

  if (isOrderCompleted(raw)) {
    return { apply: true, reason: 'completed' };
  }

  if (state.completionLocked) {
    return { apply: false, reason: 'completion_locked' };
  }

  if (meta.hasPendingWrites) {
    return { apply: true, reason: 'pending_writes' };
  }

  if (
    state.lastUpdatedAtMs > 0 &&
    updatedAtMs > 0 &&
    updatedAtMs < state.lastUpdatedAtMs
  ) {
    return { apply: false, reason: 'older_updatedAt' };
  }

  if (
    state.lastUpdatedAtMs > 0 &&
    updatedAtMs > 0 &&
    updatedAtMs === state.lastUpdatedAtMs &&
    rank < state.lastCourierRank
  ) {
    return { apply: false, reason: 'equal_timestamp_lower_rank' };
  }

  if (
    updatedAtMs > 0 &&
    state.lastUpdatedAtMs > 0 &&
    updatedAtMs === state.lastUpdatedAtMs &&
    rank === state.lastCourierRank
  ) {
    return { apply: false, reason: 'duplicate_snapshot' };
  }

  if (
    rank < state.lastCourierRank &&
    !(updatedAtMs > state.lastUpdatedAtMs)
  ) {
    return { apply: false, reason: 'courier_rank_regression' };
  }

  if (rank > state.lastCourierRank) {
    return { apply: true, reason: 'courier_rank_forward' };
  }

  if (!meta.fromCache) {
    if (updatedAtMs > state.lastUpdatedAtMs) {
      return { apply: true, reason: 'server_newer_updatedAt' };
    }
    if (rank >= state.lastCourierRank) {
      return { apply: true, reason: 'server_same_or_forward_rank' };
    }
    return { apply: false, reason: 'server_rank_regression' };
  }

  if (!state.hasServerSnapshot) {
    return { apply: true, reason: 'bootstrap_cache' };
  }

  if (updatedAtMs > state.lastUpdatedAtMs) {
    return { apply: true, reason: 'cache_newer_updatedAt' };
  }

  return { apply: false, reason: 'stale_cache_after_server' };
}

/** Mandatory log when a customer snapshot is rejected. */
export function logCustomerSnapshotRejected(
  orderId: string,
  incoming: Record<string, unknown>,
  current: {
    updatedAtMs: number;
    deliveryStatus: unknown;
    status: unknown;
  },
  reason: string,
  meta?: { fromCache?: boolean; source?: string },
): void {
  console.log('[CUSTOMER SNAPSHOT REJECTED]', {
    orderId,
    reason,
    incomingUpdatedAt: resolveOrderUpdatedAtMs(incoming) || null,
    currentUpdatedAt: current.updatedAtMs || null,
    incomingDeliveryStatus: incoming.deliveryStatus ?? null,
    currentDeliveryStatus: current.deliveryStatus ?? null,
    incomingStatus: incoming.status ?? null,
    currentStatus: current.status ?? null,
    incomingRank: resolveCustomerCourierRank(incoming),
    currentRank: resolveCustomerCourierRank({
      status: current.status,
      deliveryStatus: current.deliveryStatus,
    }),
    fromCache: meta?.fromCache ?? null,
    source: meta?.source ?? null,
    timestamp: Date.now(),
  });
}

/**
 * Per-document gate for customer order listeners.
 * Uses monotonic courier rank + `updatedAtMs` — never rejects forward server progress.
 * Once `status=completed` or `deliveryStatus=delivered`, never regress.
 */
export class OrderSnapshotFreshnessGate {
  private lastCourierRank = 0;
  private lastUpdatedAtMs = 0;
  private hasServerSnapshot = false;
  private completionLocked = false;
  private lastStatus: unknown = null;
  private lastDeliveryStatus: unknown = null;

  getState(): CustomerSnapshotState {
    return {
      lastCourierRank: this.lastCourierRank,
      lastUpdatedAtMs: this.lastUpdatedAtMs,
      hasServerSnapshot: this.hasServerSnapshot,
      completionLocked: this.completionLocked,
      currentStatus: this.lastStatus,
      currentDeliveryStatus: this.lastDeliveryStatus,
    };
  }

  shouldApply(raw: Record<string, unknown>, meta: OrderSnapshotMeta): boolean {
    const decision = evaluateCustomerSnapshotFreshness(raw, meta, this.getState());

    if (!decision.apply) {
      return false;
    }

    const updatedAtMs = resolveOrderUpdatedAtMs(raw);
    const rank = resolveCustomerCourierRank(raw);

    if (isOrderCompleted(raw)) {
      this.completionLocked = true;
    }

    this.lastCourierRank = Math.max(this.lastCourierRank, rank);
    this.lastUpdatedAtMs = Math.max(this.lastUpdatedAtMs, updatedAtMs);
    this.lastStatus = raw.status ?? this.lastStatus;
    this.lastDeliveryStatus = raw.deliveryStatus ?? this.lastDeliveryStatus;
    if (!meta.fromCache || isOrderCompleted(raw)) {
      this.hasServerSnapshot = true;
    }

    return true;
  }

  markServerBootstrap(): void {
    this.hasServerSnapshot = true;
  }

  seedFromEmitted(raw: Record<string, unknown>): void {
    const updatedAtMs = resolveOrderUpdatedAtMs(raw);
    const rank = resolveCustomerCourierRank(raw);
    this.lastCourierRank = Math.max(this.lastCourierRank, rank);
    this.lastUpdatedAtMs = Math.max(this.lastUpdatedAtMs, updatedAtMs);
    this.lastStatus = raw.status ?? this.lastStatus;
    this.lastDeliveryStatus = raw.deliveryStatus ?? this.lastDeliveryStatus;
    if (isOrderCompleted(raw)) {
      this.completionLocked = true;
    }
  }
}

/**
 * Query-level gate — ignore cached collection snapshots once server data arrived.
 * Never accept a server snapshot that drops all docs when we already had results.
 */
export class QuerySnapshotFreshnessGate {
  private hasServerSnapshot = false;
  private lastServerDocCount = 0;

  shouldApply(fromCache: boolean, docCount: number): boolean {
    if (!fromCache) {
      if (this.hasServerSnapshot && docCount === 0 && this.lastServerDocCount > 0) {
        return false;
      }
      this.hasServerSnapshot = true;
      if (docCount > 0) {
        this.lastServerDocCount = Math.max(this.lastServerDocCount, docCount);
      }
      return true;
    }
    return !this.hasServerSnapshot;
  }
}
