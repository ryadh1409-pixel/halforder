import { isDeliveryStageRegression, resolveDeliveryStageRank } from '@/lib/deliveryStageRank';
import { isOrderCompleted } from '@/lib/orderCompletion';
import { safeToMillis } from '@/utils/safeToMillis';

export type OrderSnapshotMeta = {
  fromCache: boolean;
  hasPendingWrites: boolean;
};

/** Document `updatedAt` only — tiebreaker when delivery stage rank is unchanged. */
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
    deliveryStageRank: resolveDeliveryStageRank(raw),
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
 * - Delivery stage rank is primary — forward stage always wins (even when `updatedAt` is null/older)
 * - Same stage: use `updatedAt` only as tiebreaker when both sides have a resolved timestamp
 * - Terminal lock: delivered/completed cannot regress
 */
export function evaluateCustomerSnapshotFreshness(
  raw: Record<string, unknown>,
  meta: OrderSnapshotMeta,
  state: CustomerSnapshotState,
): SnapshotFreshnessDecision {
  const updatedAtMs = resolveOrderUpdatedAtMs(raw);
  const rank = resolveDeliveryStageRank(raw);

  if (isOrderCompleted(raw)) {
    return { apply: true, reason: 'completed' };
  }

  if (state.completionLocked) {
    return { apply: false, reason: 'completion_locked' };
  }

  if (meta.hasPendingWrites) {
    return { apply: true, reason: 'pending_writes' };
  }

  if (rank > state.lastCourierRank) {
    return { apply: true, reason: 'delivery_stage_forward' };
  }

  if (isDeliveryStageRegression(state.lastCourierRank, rank)) {
    return { apply: false, reason: 'delivery_stage_regression' };
  }

  if (
    updatedAtMs > 0 &&
    state.lastUpdatedAtMs > 0 &&
    updatedAtMs < state.lastUpdatedAtMs
  ) {
    return { apply: false, reason: 'older_updatedAt_same_stage' };
  }

  if (
    updatedAtMs > 0 &&
    state.lastUpdatedAtMs > 0 &&
    updatedAtMs === state.lastUpdatedAtMs
  ) {
    return { apply: false, reason: 'duplicate_snapshot' };
  }

  if (!meta.fromCache) {
    return { apply: true, reason: 'server_same_or_forward_stage' };
  }

  if (!state.hasServerSnapshot) {
    return { apply: true, reason: 'bootstrap_cache' };
  }

  if (updatedAtMs > state.lastUpdatedAtMs) {
    return { apply: true, reason: 'cache_newer_updatedAt' };
  }

  if (updatedAtMs === 0) {
    return { apply: true, reason: 'cache_same_stage_null_updatedAt' };
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
    incomingRank: resolveDeliveryStageRank(incoming),
    currentRank: resolveDeliveryStageRank({
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
 * Uses monotonic delivery stage rank — never rejects forward server progress.
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
    const rank = resolveDeliveryStageRank(raw);

    if (isOrderCompleted(raw)) {
      this.completionLocked = true;
    }

    this.lastCourierRank = Math.max(this.lastCourierRank, rank);
    if (updatedAtMs > 0) {
      this.lastUpdatedAtMs = Math.max(this.lastUpdatedAtMs, updatedAtMs);
    }
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
    const rank = resolveDeliveryStageRank(raw);
    this.lastCourierRank = Math.max(this.lastCourierRank, rank);
    if (updatedAtMs > 0) {
      this.lastUpdatedAtMs = Math.max(this.lastUpdatedAtMs, updatedAtMs);
    }
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
