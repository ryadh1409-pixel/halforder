import { resolveCustomerCourierRank } from '@/lib/customerCourierRank';
import { isOrderCompleted } from '@/lib/orderCompletion';
import { safeToMillis } from '@/utils/safeToMillis';

export type OrderSnapshotMeta = {
  fromCache: boolean;
  hasPendingWrites: boolean;
};

/** Best-effort monotonic freshness for lifecycle fields on `orders/{id}` — logging only. */
export function resolveOrderFreshnessMs(raw: Record<string, unknown>): number {
  return Math.max(
    safeToMillis(raw.updatedAt) ?? 0,
    safeToMillis(raw.updatedAtMs) ?? 0,
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
    updatedAt: resolveOrderFreshnessMs(raw) || null,
    courierRank: resolveCustomerCourierRank(raw),
    fromCache: meta.fromCache,
    hasPendingWrites: meta.hasPendingWrites,
  });
}

/**
 * Per-document gate for customer order listeners.
 * Uses monotonic courier rank — never rejects forward progress when timestamps are null/unresolved.
 * Once `status=completed` or `deliveryStatus=delivered`, never regress.
 */
export class OrderSnapshotFreshnessGate {
  private lastCourierRank = 0;
  private hasServerSnapshot = false;
  private completionLocked = false;

  shouldApply(raw: Record<string, unknown>, meta: OrderSnapshotMeta): boolean {
    if (isOrderCompleted(raw)) {
      this.completionLocked = true;
      this.lastCourierRank = Math.max(this.lastCourierRank, resolveCustomerCourierRank(raw));
      this.hasServerSnapshot = this.hasServerSnapshot || !meta.fromCache;
      return true;
    }

    if (this.completionLocked) {
      return false;
    }

    if (meta.hasPendingWrites) {
      return true;
    }

    const rank = resolveCustomerCourierRank(raw);

    if (rank > this.lastCourierRank) {
      this.lastCourierRank = rank;
      if (!meta.fromCache) {
        this.hasServerSnapshot = true;
      }
      return true;
    }

    if (!meta.fromCache) {
      this.hasServerSnapshot = true;
      if (rank >= this.lastCourierRank) {
        this.lastCourierRank = Math.max(this.lastCourierRank, rank);
        return true;
      }
      return false;
    }

    if (!this.hasServerSnapshot) {
      this.lastCourierRank = Math.max(this.lastCourierRank, rank);
      return true;
    }

    return false;
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
