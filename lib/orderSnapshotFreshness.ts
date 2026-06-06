import { safeToMillis } from '@/utils/safeToMillis';

export type OrderSnapshotMeta = {
  fromCache: boolean;
  hasPendingWrites: boolean;
};

/** Best-effort monotonic freshness for lifecycle fields on `orders/{id}`. */
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

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Terminal marketplace completion — always prefer over in-flight cache rows. */
export function isTerminalOrderSnapshot(raw: Record<string, unknown>): boolean {
  const status = norm(raw.status);
  const courier = norm(raw.deliveryStatus);
  return (
    status === 'completed' ||
    status === 'delivered' ||
    courier === 'delivered' ||
    raw.marketplaceArchived === true ||
    raw.earningsRecorded === true
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
    fromCache: meta.fromCache,
    hasPendingWrites: meta.hasPendingWrites,
  });
}

/**
 * Drops stale persisted-cache snapshots after server truth is known.
 * Allows cache bootstrap before the first server read; never regresses afterward.
 */
export class OrderSnapshotFreshnessGate {
  private lastAppliedFreshnessMs = -1;
  private hasServerSnapshot = false;
  private lastTerminal = false;

  shouldApply(raw: Record<string, unknown>, meta: OrderSnapshotMeta): boolean {
    if (meta.hasPendingWrites) return true;

    const freshnessMs = resolveOrderFreshnessMs(raw);
    const terminal = isTerminalOrderSnapshot(raw);

    if (!meta.fromCache) {
      this.hasServerSnapshot = true;
      if (terminal || freshnessMs >= this.lastAppliedFreshnessMs || !this.lastTerminal) {
        this.lastAppliedFreshnessMs = Math.max(this.lastAppliedFreshnessMs, freshnessMs);
        this.lastTerminal = this.lastTerminal || terminal;
        return true;
      }
      return false;
    }

    if (!this.hasServerSnapshot) {
      this.lastAppliedFreshnessMs = Math.max(this.lastAppliedFreshnessMs, freshnessMs);
      this.lastTerminal = this.lastTerminal || terminal;
      return true;
    }

    if (terminal && !this.lastTerminal) {
      this.lastAppliedFreshnessMs = Math.max(this.lastAppliedFreshnessMs, freshnessMs);
      this.lastTerminal = true;
      return true;
    }

    if (freshnessMs > this.lastAppliedFreshnessMs) {
      this.lastAppliedFreshnessMs = freshnessMs;
      this.lastTerminal = this.lastTerminal || terminal;
      return true;
    }

    return false;
  }
}

/** Query-level gate — ignore cached collection snapshots once server data arrived. */
export class QuerySnapshotFreshnessGate {
  private hasServerSnapshot = false;

  shouldApply(fromCache: boolean): boolean {
    if (!fromCache) {
      this.hasServerSnapshot = true;
      return true;
    }
    return !this.hasServerSnapshot;
  }
}
