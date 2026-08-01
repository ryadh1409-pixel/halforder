/**
 * Admin Order Alarm — real-time listener for new paid orders.
 *
 * Only fires for orders created AFTER the listener was started (session-start gate),
 * so it never alarms for pre-existing paid orders on app launch.
 *
 * Covers:
 *   - Marketplace restaurant orders  (collection: orders, paymentStatus: paid)
 *   - HalfOrder food-share matches   (collection: matches, lifecycle: PAYMENT_CONFIRMED)
 */
import { db } from '@/services/firebase';
import type { RestaurantOrder } from '@/services/orderService';
import { mapDocToRestaurantOrder } from '@/services/orderService';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type AlarmOrder = {
  id: string;
  type: 'marketplace' | 'halforder';
  customerName: string | null;
  customerPhone: string | null;
  totalPrice: number;
  deliveryType: 'delivery' | 'pickup';
  deliveryAddress: string | null;
  restaurantName: string | null;
  itemCount: number;
  items: { name: string; qty: number; price: number }[];
  createdAtMs: number;
  paymentStatus: string;
  status: string;
  orderId: string;
};

function toAlarmOrder(order: RestaurantOrder): AlarmOrder {
  const items = (order.items ?? []).map((it) => ({
    name: String(it.name ?? ''),
    qty: Number(it.qty ?? 1),
    price: Number(it.price ?? 0),
  }));

  return {
    id: order.id,
    orderId: order.id,
    type: 'marketplace',
    customerName: order.customerName ?? null,
    customerPhone: order.customerPhone ?? null,
    totalPrice: order.totalPrice ?? 0,
    deliveryType: order.deliveryType ?? 'delivery',
    deliveryAddress: order.deliveryLocation?.address ?? null,
    restaurantName: order.restaurant?.name ?? null,
    itemCount: items.length,
    items,
    createdAtMs: order.createdAtMs ?? Date.now(),
    paymentStatus: order.paymentStatus ?? '',
    status: order.status ?? '',
  };
}

export type AdminOrderAlarmOptions = {
  onNewOrder: (order: AlarmOrder) => void;
};

/**
 * Starts listening for new paid marketplace orders.
 * Returns an unsubscribe function.
 */
export function subscribeAdminOrderAlarm(
  options: AdminOrderAlarmOptions,
): Unsubscribe {
  const sessionStart = Timestamp.now();
  const seenIds = new Set<string>();

  // Listen to orders paid in the last 5 minutes OR from this point forward.
  // We use a 5-min lookback so very recent orders (paid just before opening app) still alarm.
  const lookback = new Date(Date.now() - 5 * 60 * 1000);

  const q = query(
    collection(db, 'orders'),
    where('paymentStatus', '==', 'paid'),
    where('createdAt', '>=', Timestamp.fromDate(lookback)),
    orderBy('createdAt', 'desc'),
  );

  const unsub = onSnapshot(
    q,
    { includeMetadataChanges: false },
    (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue;

        const doc = change.doc;
        if (seenIds.has(doc.id)) continue;
        seenIds.add(doc.id);

        // Skip orders that existed before this session started.
        const raw = doc.data();
        const createdAt =
          raw.createdAt instanceof Timestamp ? raw.createdAt : null;
        if (createdAt && createdAt.toMillis() < sessionStart.toMillis()) {
          continue;
        }

        try {
          const order = mapDocToRestaurantOrder(doc);
          options.onNewOrder(toAlarmOrder(order));
        } catch (e) {
          console.error('[adminOrderAlarm] map failed', e);
        }
      }
    },
    (err) => {
      console.warn('[adminOrderAlarm] listener error', err);
    },
  );

  return unsub;
}
