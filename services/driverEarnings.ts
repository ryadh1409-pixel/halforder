/**
 * Driver earnings Firestore listeners — queries `orders/` with status in (delivered, completed).
 */
import {
  buildDriverEarningsStats,
  DRIVER_COMPLETED_STATUSES,
  type DriverEarningsStats,
} from '@/lib/driverEarnings';
import { QuerySnapshotFreshnessGate } from '@/lib/orderSnapshotFreshness';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  getDocsFromServer,
  onSnapshot,
  query,
  where,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';

export {
  buildDriverEarningsStats,
  DRIVER_COMPLETED_STATUSES,
  isDriverCompletedEarningsOrder,
  resolveDriverPayoutFromOrder,
  type DriverEarningsBreakdownItem,
  type DriverEarningsStats,
} from '@/lib/driverEarnings';

export const EMPTY_DRIVER_EARNINGS_STATS: DriverEarningsStats = {
  deliveries: 0,
  earnings: 0,
  earningsToday: 0,
  earningsWeek: 0,
  deliveriesToday: 0,
  deliveriesWeek: 0,
  averageEarning: 0,
  breakdown: [],
};

const completedStatusFilter = where('status', 'in', [...DRIVER_COMPLETED_STATUSES]);

function mapDoc(docSnap: { id: string; data: () => Record<string, unknown> }) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    data: () => ({
      ...data,
      deliveredAtMs:
        typeof data.deliveredAtMs === 'number'
          ? data.deliveredAtMs
          : safeToMillis(data.deliveredAt),
      completedAtMs:
        typeof data.completedAtMs === 'number'
          ? data.completedAtMs
          : safeToMillis(data.completedAt),
    }),
  };
}

function driverCompletedOrdersQuery(uid: string, field: 'driverId' | 'assignedDriverId'): Query {
  return query(collection(db, 'orders'), where(field, '==', uid), completedStatusFilter);
}

async function bootstrapCompletedOrders(
  uid: string,
  field: 'driverId' | 'assignedDriverId',
): Promise<ReturnType<typeof mapDoc>[]> {
  const snap = await getDocsFromServer(driverCompletedOrdersQuery(uid, field));
  console.log('SERVER ORDER', {
    source: 'subscribeDriverEarnings:bootstrap',
    field,
    driverUid: uid,
    docCount: snap.docs.length,
    fromCache: snap.metadata.fromCache,
    hasPendingWrites: snap.metadata.hasPendingWrites,
  });
  return snap.docs.map((docSnap) =>
    mapDoc({
      id: docSnap.id,
      data: () => docSnap.data() as Record<string, unknown>,
    }),
  );
}

function attachCompletedOrdersListener(
  uid: string,
  field: 'driverId' | 'assignedDriverId',
  onRows: (rows: ReturnType<typeof mapDoc>[]) => void,
): Unsubscribe {
  const queryGate = new QuerySnapshotFreshnessGate();
  let serverRows: ReturnType<typeof mapDoc>[] | null = null;

  void bootstrapCompletedOrders(uid, field)
    .then((rows) => {
      serverRows = rows;
      onRows(rows);
    })
    .catch((err) => {
      console.warn('[subscribeDriverEarnings] bootstrap failed', { field, uid, err });
    });

  return onSnapshot(
    driverCompletedOrdersQuery(uid, field),
    (snap) => {
      const rows = snap.docs.map((docSnap) =>
        mapDoc({
          id: docSnap.id,
          data: () => docSnap.data() as Record<string, unknown>,
        }),
      );

      if (!queryGate.shouldApply(snap.metadata.fromCache)) {
        console.log('CACHE ORDER', {
          source: 'subscribeDriverEarnings:ignored',
          field,
          driverUid: uid,
          docCount: rows.length,
          fromCache: true,
          hasPendingWrites: snap.metadata.hasPendingWrites,
        });
        if (serverRows != null) {
          onRows(serverRows);
        }
        return;
      }

      console.log('SERVER ORDER', {
        source: 'subscribeDriverEarnings',
        field,
        driverUid: uid,
        docCount: rows.length,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
      serverRows = rows;
      onRows(rows);
    },
    (err) => {
      console.warn('[subscribeDriverEarnings] listener error', { field, uid, err });
      onRows([]);
    },
  );
}

/**
 * Live earnings — merges driverId + assignedDriverId queries, dedupes by orderId,
 * totals persisted `driverPayout` per order.
 */
export function subscribeDriverEarnings(
  driverUid: string,
  onStats: (stats: DriverEarningsStats) => void,
): Unsubscribe {
  const uid = driverUid.trim();
  if (!uid) {
    onStats(EMPTY_DRIVER_EARNINGS_STATS);
    return () => {};
  }

  let byDriverId: ReturnType<typeof mapDoc>[] = [];
  let byAssignedId: ReturnType<typeof mapDoc>[] = [];

  const emitMerged = () => {
    const merged = new Map<string, ReturnType<typeof mapDoc>>();
    for (const row of byAssignedId) merged.set(row.id, row);
    for (const row of byDriverId) merged.set(row.id, row);
    onStats(buildDriverEarningsStats(Array.from(merged.values())));
  };

  const unsubDriverId = attachCompletedOrdersListener(uid, 'driverId', (rows) => {
    byDriverId = rows;
    emitMerged();
  });

  const unsubAssigned = attachCompletedOrdersListener(uid, 'assignedDriverId', (rows) => {
    byAssignedId = rows;
    emitMerged();
  });

  return () => {
    unsubDriverId();
    unsubAssigned();
  };
}
