import { isEffectivelyDelivered } from '@/lib/driverCourierSnapshotMerge';
import {
  reconcileActiveDeliverySnapshot,
  type DriverOrderSnapshotSource,
} from '@/lib/driverCourierSnapshotMerge';
import {
  isDriverHubOrderForceCompleted,
  markDriverHubOrderCompleted,
  rememberDriverActiveDelivery,
} from '@/lib/driverHubOrdersStore';
import {
  subscribeActiveDelivery,
  subscribeDriverActiveOrders,
  type ActiveDelivery,
} from '@/services/delivery';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

function applySnapshot(
  setOrder: Dispatch<SetStateAction<ActiveDelivery | null>>,
  source: DriverOrderSnapshotSource,
  row: ActiveDelivery | null,
  meta?: { fromCache?: boolean; hasPendingWrites?: boolean },
): void {
  if (!row) {
    setOrder(null);
    return;
  }
  if (isDriverHubOrderForceCompleted(row.id) || isEffectivelyDelivered(row)) {
    if (!isDriverHubOrderForceCompleted(row.id)) {
      markDriverHubOrderCompleted(row.id, 'firestore_terminal', { activeDelivery: row });
    }
    setOrder(null);
    return;
  }
  rememberDriverActiveDelivery(row);
  setOrder((prev) => {
    const merged = reconcileActiveDeliverySnapshot(prev, row, source, meta);
    return merged ?? prev;
  });
}

/**
 * Live order for `/(driver)/active/[id]` — merges doc listener + driver active list
 * so stale cache/query snapshots never regress courier status.
 */
export function useActiveDelivery(
  orderId: string | null | undefined,
  driverId?: string | null,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false;
  const [order, setOrder] = useState<ActiveDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sourcesLoggedRef = useRef<Set<DriverOrderSnapshotSource>>(new Set());

  useEffect(() => {
    sourcesLoggedRef.current.clear();
    if (!enabled || !orderId) {
      setOrder(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    const unsubDoc = subscribeActiveDelivery(
      orderId,
      (row, meta) => {
        if (row && __DEV__ && !sourcesLoggedRef.current.has('active_delivery')) {
          sourcesLoggedRef.current.add('active_delivery');
          console.log('[ACTIVE DELIVERY] subscribed', orderId);
        }
        applySnapshot(setOrder, 'active_delivery', row, meta);
        setLoading(false);
        setError(null);
      },
    );

    const did = typeof driverId === 'string' ? driverId.trim() : '';
    if (!did) {
      return () => {
        unsubDoc();
      };
    }

    const unsubList = subscribeDriverActiveOrders(did, (rows) => {
      const match = Array.isArray(rows) ? rows.find((r) => r.id === orderId) : null;
      if (match) {
        applySnapshot(setOrder, 'driver_orders', match);
      }
      setLoading(false);
      setError(null);
    });

    return () => {
      unsubDoc();
      unsubList();
    };
  }, [orderId, driverId, enabled]);

  return useMemo(
    () => ({
      order,
      loading,
      error,
    }),
    [order, loading, error],
  );
}
