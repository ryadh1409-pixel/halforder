/**
 * Driver earnings Firestore listeners — completed `orders/` only.
 */
import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  buildDriverEarningsStats,
  DRIVER_COMPLETED_STATUSES,
  isDriverCompletedEarningsOrder,
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
  platformFees: 0,
  breakdown: [],
};

type MappedDoc = { id: string; data: () => Record<string, unknown> };

function mapDoc(docSnap: { id: string; data: () => Record<string, unknown> }): MappedDoc {
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
      updatedAtMs:
        typeof data.updatedAtMs === 'number'
          ? data.updatedAtMs
          : safeToMillis(data.updatedAt),
    }),
  };
}

function isEarningsEligible(data: Record<string, unknown>): boolean {
  return isOrderCompleted(data) || isDriverCompletedEarningsOrder(data);
}

type EarningsQueryKind = 'earningsRecorded' | 'completedStatus';

function driverEarningsQuery(
  uid: string,
  field: 'driverId' | 'assignedDriverId',
  kind: EarningsQueryKind,
): Query {
  const base = [collection(db, 'orders'), where(field, '==', uid)];
  if (kind === 'earningsRecorded') {
    return query(...base, where('earningsRecorded', '==', true));
  }
  return query(
    ...base,
    where('deliveryType', '==', 'delivery'),
    where('status', 'in', [...DRIVER_COMPLETED_STATUSES]),
  );
}

async function bootstrapQuery(
  uid: string,
  field: 'driverId' | 'assignedDriverId',
  kind: EarningsQueryKind,
): Promise<MappedDoc[]> {
  const snap = await getDocsFromServer(driverEarningsQuery(uid, field, kind));
  console.log('SERVER ORDER', {
    source: 'subscribeDriverEarnings:bootstrap',
    field,
    kind,
    driverUid: uid,
    docCount: snap.docs.length,
    fromCache: snap.metadata.fromCache,
  });
  return snap.docs
    .map((docSnap) =>
      mapDoc({ id: docSnap.id, data: () => docSnap.data() as Record<string, unknown> }),
    )
    .filter((row) => isEarningsEligible(row.data()));
}

function attachEarningsListener(
  uid: string,
  field: 'driverId' | 'assignedDriverId',
  kind: EarningsQueryKind,
  onRows: (rows: MappedDoc[]) => void,
): Unsubscribe {
  const queryGate = new QuerySnapshotFreshnessGate();
  let serverRows: MappedDoc[] | null = null;

  void bootstrapQuery(uid, field, kind)
    .then((rows) => {
      if (rows.length === 0) return;
      serverRows = rows;
      onRows(rows);
    })
    .catch((err) => {
      console.warn('[subscribeDriverEarnings] bootstrap failed', { field, kind, uid, err });
    });

  return onSnapshot(
    driverEarningsQuery(uid, field, kind),
    (snap) => {
      const rows = snap.docs
        .map((docSnap) =>
          mapDoc({ id: docSnap.id, data: () => docSnap.data() as Record<string, unknown> }),
        )
        .filter((row) => isEarningsEligible(row.data()));

      if (!queryGate.shouldApply(snap.metadata.fromCache, rows.length)) {
        console.log('CACHE ORDER', {
          source: 'subscribeDriverEarnings:ignored',
          field,
          kind,
          driverUid: uid,
          docCount: rows.length,
          fromCache: snap.metadata.fromCache,
          keptDocCount: serverRows?.length ?? 0,
        });
        if (serverRows != null && serverRows.length > 0) onRows(serverRows);
        return;
      }

      if (rows.length === 0) {
        if (serverRows != null && serverRows.length > 0) {
          onRows(serverRows);
        }
        return;
      }

      console.log('SERVER ORDER', {
        source: 'subscribeDriverEarnings',
        field,
        kind,
        driverUid: uid,
        docCount: rows.length,
        fromCache: snap.metadata.fromCache,
      });
      serverRows = rows;
      onRows(rows);
    },
    (err) => {
      console.warn('[subscribeDriverEarnings] listener error', { field, kind, uid, err });
      if (serverRows != null && serverRows.length > 0) onRows(serverRows);
    },
  );
}

/**
 * Live earnings — sticky merge by orderId; empty snapshots never zero out completed orders.
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

  const completedById = new Map<string, MappedDoc>();

  const ingest = (rows: MappedDoc[]) => {
    if (rows.length === 0) return;
    for (const row of rows) {
      if (isEarningsEligible(row.data())) {
        completedById.set(row.id, row);
      }
    }
    onStats(buildDriverEarningsStats(Array.from(completedById.values())));
  };

  const unsubs = [
    attachEarningsListener(uid, 'driverId', 'earningsRecorded', ingest),
    attachEarningsListener(uid, 'driverId', 'completedStatus', ingest),
    attachEarningsListener(uid, 'assignedDriverId', 'earningsRecorded', ingest),
    attachEarningsListener(uid, 'assignedDriverId', 'completedStatus', ingest),
  ];

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
