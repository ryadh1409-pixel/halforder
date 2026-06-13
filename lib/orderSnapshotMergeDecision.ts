export type SnapshotMergeSide = {
  deliveryStatus: string;
  updatedAtMs: number | null | undefined;
  label?: string;
};

export type SnapshotMergeDecision = {
  accept: boolean;
  reason: string;
};

function resolveMs(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

/**
 * Timestamp-first merge rules for Firestore vs optimistic local snapshots.
 *
 * A. local updatedAt null → Firestore wins
 * B. remote updatedAt > local → Firestore wins
 * C. remote updatedAt == local → prefer Firestore
 * D. local updatedAt newer → keep local
 */
export function evaluateSnapshotMergeDecision(
  local: SnapshotMergeSide,
  remote: SnapshotMergeSide,
): SnapshotMergeDecision {
  const localMs = resolveMs(local.updatedAtMs);
  const remoteMs = resolveMs(remote.updatedAtMs);

  if (localMs === 0 && remoteMs > 0) {
    return { accept: true, reason: 'local_updated_at_null_firestore_wins' };
  }
  if (remoteMs === 0 && localMs > 0) {
    return { accept: false, reason: 'remote_updated_at_null_keep_local' };
  }
  if (localMs > 0 && remoteMs > 0) {
    if (remoteMs > localMs) {
      return { accept: true, reason: 'remote_updated_at_newer' };
    }
    if (remoteMs < localMs) {
      return { accept: false, reason: 'local_updated_at_newer' };
    }
    return { accept: true, reason: 'equal_updated_at_prefer_firestore' };
  }
  return { accept: true, reason: 'both_updated_at_null_prefer_firestore' };
}

export function logSnapshotMergeDecision(
  scope: string,
  orderId: string,
  local: SnapshotMergeSide,
  remote: SnapshotMergeSide,
  decision: SnapshotMergeDecision,
  extra?: Record<string, unknown>,
): void {
  const payload = {
    scope,
    orderId,
    decision: decision.reason,
    accept: decision.accept,
    localDeliveryStatus: local.deliveryStatus,
    remoteDeliveryStatus: remote.deliveryStatus,
    localUpdatedAt: local.updatedAtMs ?? null,
    remoteUpdatedAt: remote.updatedAtMs ?? null,
    ...extra,
  };
  if (decision.accept) {
    console.log(`[SNAPSHOT MERGE] accepted`, payload);
  } else {
    console.log(`[SNAPSHOT MERGE] ignored stale`, payload);
  }
}
