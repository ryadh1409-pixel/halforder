import { resolveDeliveryStageRank } from '@/lib/deliveryStageRank';
import {
  logCustomerOrderSnapshot,
  logRawFirestoreCustomerDoc,
} from '@/lib/customerOrderSnapshotLog';
import {
  evaluateCustomerSnapshotFreshness,
  logCustomerSnapshotRejected,
  logServerOrCacheOrder,
  OrderSnapshotFreshnessGate,
  resolveOrderUpdatedAtMs,
} from '@/lib/orderSnapshotFreshness';
import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  doc,
  getDocFromServer,
  onSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '../services/firebase';

/**
 * Live `orders/{orderId}` document snapshot (raw Firestore — server bootstrap, no stale cache emit).
 */
export function useOrder(orderId: string) {
  const oid = orderId.trim();
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(!!oid);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!oid) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const ref = doc(db, 'orders', oid);
    const freshnessGate = new OrderSnapshotFreshnessGate();
    let cancelled = false;
    let serverBootstrapDone = false;
    let lastUpdatedAtMs = 0;
    let lastCourierRank = 0;
    let completionLocked = false;
    let lastStatus: unknown = null;
    let lastDeliveryStatus: unknown = null;

    const applySnapshot = (snap: DocumentSnapshot, ingress: 'bootstrap' | 'listener') => {
      if (cancelled) return;
      if (!snap.exists()) {
        setSnapshot(snap);
        setLoading(false);
        setError(null);
        return;
      }

      const raw = snap.data() as Record<string, unknown>;
      const meta = {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      };

      logRawFirestoreCustomerDoc(oid, raw, { ...meta, source: 'useOrder' });

      if (!serverBootstrapDone && meta.fromCache && ingress !== 'bootstrap') {
        logServerOrCacheOrder(snap.id, raw, meta, 'useOrder:cache_before_bootstrap');
        return;
      }

      if (ingress === 'bootstrap' || !meta.fromCache) {
        serverBootstrapDone = true;
        freshnessGate.markServerBootstrap();
      }

      const gateDecision = evaluateCustomerSnapshotFreshness(raw, meta, {
        lastCourierRank,
        lastUpdatedAtMs,
        hasServerSnapshot: serverBootstrapDone,
        completionLocked,
        currentStatus: lastStatus,
        currentDeliveryStatus: lastDeliveryStatus,
      });

      if (!gateDecision.apply) {
        logCustomerSnapshotRejected(
          oid,
          raw,
          {
            updatedAtMs: lastUpdatedAtMs,
            deliveryStatus: lastDeliveryStatus,
            status: lastStatus,
          },
          gateDecision.reason,
          { fromCache: meta.fromCache, source: 'useOrder' },
        );
        logServerOrCacheOrder(snap.id, raw, meta, `useOrder:ignored:${gateDecision.reason}`);
        return;
      }

      const updatedAtMs = resolveOrderUpdatedAtMs(raw);
      const rank = resolveDeliveryStageRank(raw);
      if (updatedAtMs > 0) {
        lastUpdatedAtMs = Math.max(lastUpdatedAtMs, updatedAtMs);
      }
      lastCourierRank = Math.max(lastCourierRank, rank);
      lastStatus = raw.status ?? lastStatus;
      lastDeliveryStatus = raw.deliveryStatus ?? lastDeliveryStatus;
      if (isOrderCompleted(raw)) {
        completionLocked = true;
      }
      freshnessGate.seedFromEmitted(raw);

      logServerOrCacheOrder(snap.id, raw, meta, 'useOrder');
      logCustomerOrderSnapshot(snap.id, raw, { ...meta, source: 'useOrder' });
      setSnapshot(snap);
      setLoading(false);
      setError(null);
    };

    void getDocFromServer(ref)
      .then((snap) => applySnapshot(snap, 'bootstrap'))
      .catch(() => {
        if (!cancelled) {
          serverBootstrapDone = true;
          setLoading(false);
        }
      });

    const unsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => applySnapshot(snap, 'listener'),
      () => {
        if (!cancelled) {
          setSnapshot(null);
          setLoading(false);
          setError(null);
        }
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [oid]);

  return useMemo(
    () => ({
      snapshot,
      loading,
      stale: false,
      error,
    }),
    [snapshot, loading, error],
  );
}
