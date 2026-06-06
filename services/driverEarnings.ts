/**
 * Driver earnings Firestore listeners — queries `orders/` with status in (delivered, completed).
 */
import {
  buildDriverEarningsStats,
  DRIVER_COMPLETED_STATUSES,
  type DriverEarningsStats,
} from '@/lib/driverEarnings';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  onSnapshot,
  query,
  where,
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

  const unsubDriverId = onSnapshot(
    query(collection(db, 'orders'), where('driverId', '==', uid), completedStatusFilter),
    (snap) => {
      byDriverId = snap.docs.map((docSnap) =>
        mapDoc({
          id: docSnap.id,
          data: () => docSnap.data() as Record<string, unknown>,
        }),
      );
      emitMerged();
    },
    () => {
      byDriverId = [];
      emitMerged();
    },
  );

  const unsubAssigned = onSnapshot(
    query(
      collection(db, 'orders'),
      where('assignedDriverId', '==', uid),
      completedStatusFilter,
    ),
    (snap) => {
      byAssignedId = snap.docs.map((docSnap) =>
        mapDoc({
          id: docSnap.id,
          data: () => docSnap.data() as Record<string, unknown>,
        }),
      );
      emitMerged();
    },
    () => {
      byAssignedId = [];
      emitMerged();
    },
  );

  return () => {
    unsubDriverId();
    unsubAssigned();
  };
}
