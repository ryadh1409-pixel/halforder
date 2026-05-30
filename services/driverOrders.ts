/**
 * Driver-available marketplace deliveries (courier queue).
 * Prefer `driver_marketplace_pool` listeners — rules-optimized denormalized collection.
 */
import {
  isDriverMarketplaceVisible,
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import { marketplaceLog } from '@/lib/marketplaceLogger';
import { db } from './firebase';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

export type DriverAvailableOrderQuery = {
  limit?: number;
};

function mapPoolSnapshot(snap: QuerySnapshot): void {
  marketplaceLog.listenerUpdate(snap.size, { collection: 'orders_direct_query' });
}

/** Direct orders query (requires composite index). Pool listener is preferred. */
export function subscribeDriverAvailableOrders(
  onData: (snap: QuerySnapshot) => void,
  onError?: (error: unknown) => void,
  opts: DriverAvailableOrderQuery = {},
): Unsubscribe {
  const rowLimit = opts.limit ?? 20;
  const q = query(
    collection(db, 'orders'),
    where('deliveryType', '==', 'delivery'),
    where('deliveryStatus', 'in', [
      MARKETPLACE_DELIVERY_STATUS.ACCEPTED,
      MARKETPLACE_DELIVERY_STATUS.PREPARING,
      MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
      'waiting_driver',
    ]),
    where('assignedDriverId', '==', null),
    orderBy('createdAt', 'desc'),
    limit(rowLimit),
  );
  return onSnapshot(
    q,
    (snap) => {
      mapPoolSnapshot(snap);
      onData(snap);
    },
    onError ?? (() => undefined),
  );
}

export function isActiveMarketplacePoolDoc(data: Record<string, unknown>): boolean {
  if (typeof data.driverId === 'string' && data.driverId.length > 0) return false;
  if (typeof data.assignedDriverId === 'string' && data.assignedDriverId.length > 0) {
    return false;
  }
  return isDriverMarketplaceVisible(normalizeMarketplaceDeliveryStatus(data.deliveryStatus));
}
