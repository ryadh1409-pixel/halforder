import { logCustomerOrderSnapshot } from '@/lib/customerOrderSnapshotLog';
import { logServerOrCacheOrder, OrderSnapshotFreshnessGate } from '@/lib/orderSnapshotFreshness';
import { doc, onSnapshot, type DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '../services/firebase';

/**
 * Live `orders/{orderId}` document snapshot (raw Firestore — no stage cache).
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
    const unsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
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
        if (!freshnessGate.shouldApply(raw, meta)) {
          logServerOrCacheOrder(snap.id, raw, meta, 'useOrder:ignored');
          return;
        }
        logServerOrCacheOrder(snap.id, raw, meta, 'useOrder');
        logCustomerOrderSnapshot(snap.id, raw, { ...meta, source: 'useOrder' });
        setSnapshot(snap);
        setLoading(false);
        setError(null);
      },
      () => {
        setSnapshot(null);
        setLoading(false);
        setError(null);
      },
    );
    return () => unsub();
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
