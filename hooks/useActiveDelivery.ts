import {
  DRIVER_SNAPSHOT_SOURCE_PRIORITY,
  isEffectivelyDelivered,
  reconcileActiveDeliverySnapshot,
  type DriverOrderSnapshotSource,
} from '@/lib/driverCourierSnapshotMerge';
import {
  isDriverHubOrderForceCompleted,
  markDriverHubOrderCompleted,
  rememberDriverActiveDelivery,
} from '@/lib/driverHubOrdersStore';
import { useOptionalDriverActiveOrdersFeed } from '@/contexts/DriverActiveOrdersContext';
import {
  subscribeActiveDelivery,
  type ActiveDelivery,
} from '@/services/delivery';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

type DocListenerState = {
  hasServerSnapshot: boolean;
  fromCache: boolean;
};

function shouldIgnoreLowerPrioritySnapshot(
  source: DriverOrderSnapshotSource,
  docListener: DocListenerState,
): boolean {
  if (source === 'active_delivery') return false;
  if (!docListener.hasServerSnapshot) return false;
  const sourcePriority = DRIVER_SNAPSHOT_SOURCE_PRIORITY[source] ?? 0;
  const docPriority = DRIVER_SNAPSHOT_SOURCE_PRIORITY.active_delivery;
  if (sourcePriority < docPriority) {
    if (__DEV__) {
      console.log('[ACTIVE DELIVERY] skipping list bootstrap — doc listener is authoritative', {
        source,
        sourcePriority,
        docPriority,
        docFromCache: docListener.fromCache,
      });
    }
    return true;
  }
  return false;
}

function applySnapshot(
  setOrder: Dispatch<SetStateAction<ActiveDelivery | null>>,
  source: DriverOrderSnapshotSource,
  row: ActiveDelivery | null,
  docListener: DocListenerState,
  meta?: { fromCache?: boolean; hasPendingWrites?: boolean },
): void {
  if (!row) {
    setOrder(null);
    return;
  }
  if (shouldIgnoreLowerPrioritySnapshot(source, docListener)) {
    return;
  }
  if (isDriverHubOrderForceCompleted(row.id) || isEffectivelyDelivered(row)) {
    if (!isDriverHubOrderForceCompleted(row.id)) {
      markDriverHubOrderCompleted(row.id, 'firestore_terminal', { activeDelivery: row });
    }
    console.log('[ACTIVE DELIVERY SNAPSHOT] terminal — clearing currentDelivery', {
      orderId: row.id,
      deliveryStatus: row.firestoreDeliveryStatus ?? row.marketplaceCourierStatus,
      status: row.status,
      source,
    });
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
 * Live order for `/(driver)/active/[id]`.
 * Doc listener is authoritative. List bootstrap comes from the shared shell feed
 * (no second Firestore list subscription).
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
  const docListenerRef = useRef<DocListenerState>({
    hasServerSnapshot: false,
    fromCache: true,
  });
  const sharedFeed = useOptionalDriverActiveOrdersFeed();

  useEffect(() => {
    sourcesLoggedRef.current.clear();
    docListenerRef.current = { hasServerSnapshot: false, fromCache: true };
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
        if (row && meta && !meta.fromCache) {
          docListenerRef.current = { hasServerSnapshot: true, fromCache: false };
        } else if (row && meta) {
          docListenerRef.current = {
            hasServerSnapshot: docListenerRef.current.hasServerSnapshot,
            fromCache: meta.fromCache,
          };
        }
        if (row && __DEV__ && !sourcesLoggedRef.current.has('active_delivery')) {
          sourcesLoggedRef.current.add('active_delivery');
          console.log('[ACTIVE DELIVERY] subscribed', orderId);
        }
        applySnapshot(setOrder, 'active_delivery', row, docListenerRef.current, meta);
        setLoading(false);
        setError(null);
      },
    );

    return () => {
      unsubDoc();
    };
  }, [orderId, enabled]);

  // Bootstrap from shared list feed — no extra onSnapshot.
  useEffect(() => {
    if (!enabled || !orderId || !sharedFeed) return;
    const did = typeof driverId === 'string' ? driverId.trim() : '';
    if (did && sharedFeed.driverId !== did) return;
    const match = sharedFeed.orders.find((r) => r.id === orderId) ?? null;
    if (!match) return;
    applySnapshot(setOrder, 'driver_orders', match, docListenerRef.current);
    setLoading((prev) => (prev ? false : prev));
  }, [enabled, orderId, driverId, sharedFeed?.driverId, sharedFeed?.orders]);

  return useMemo(
    () => ({
      order,
      loading,
      error,
    }),
    [order, loading, error],
  );
}
