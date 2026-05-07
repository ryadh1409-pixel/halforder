import { db } from './firebase';
import { normalizeDeliveryStatus, type DeliveryStatus } from './deliveryStatus';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type DispatchDriver = {
  id: string;
  name: string;
  phone: string | null;
};

export type DispatchOrder = {
  id: string;
  restaurantName: string;
  restaurantImage: string | null;
  customerName: string | null;
  total: number;
  createdAtMs: number | null;
  status: string;
  deliveryStatus: DeliveryStatus;
  driverId: string | null;
  acceptedAtMs: number | null;
};

export const DRIVER_PRESENCE_COLLECTION = 'drivers';

export function driverPresenceDoc(driverId: string) {
  return doc(db, DRIVER_PRESENCE_COLLECTION, driverId);
}

function toMillis(value: unknown): number | null {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

function mapDispatchOrder(d: { id: string; data: () => Record<string, unknown> }): DispatchOrder {
  const data = d.data();
  return {
    id: d.id,
    restaurantName:
      typeof data.restaurantName === 'string'
        ? data.restaurantName
        : typeof data.restaurantId === 'string'
          ? data.restaurantId
          : 'Restaurant',
    restaurantImage:
      typeof data.restaurantImage === 'string'
        ? data.restaurantImage
        : typeof data.image === 'string'
          ? data.image
          : null,
    customerName: typeof data.customerName === 'string' ? data.customerName : null,
    total:
      typeof data.totalPrice === 'number'
        ? data.totalPrice
        : typeof data.total === 'number'
          ? data.total
          : 0,
    createdAtMs: toMillis(data.createdAt),
    status: typeof data.status === 'string' ? data.status : 'ready_for_pickup',
    deliveryStatus: normalizeDeliveryStatus(data.deliveryStatus),
    driverId: typeof data.driverId === 'string' ? data.driverId : null,
    acceptedAtMs: toMillis(data.acceptedAt),
  };
}

export async function updateDriverOnlineStatus(driverId: string, isOnline: boolean): Promise<void> {
  const ref = driverPresenceDoc(driverId);
  console.log('[ONLINE WRITE]', {
    driverId,
    path: `${DRIVER_PRESENCE_COLLECTION}/${driverId}`,
    isOnline,
  });
  await setDoc(
    ref,
    {
      isOnline,
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeAvailableOrders(
  driverId: string,
  onData: (orders: DispatchOrder[]) => void,
): Unsubscribe {
  let driverOnline = false;
  let ordersCache: DispatchOrder[] = [];
  const emit = () => {
    if (!driverOnline) {
      console.log('[DRIVER FLOW] driver offline, available queue hidden', { driverId });
      onData([]);
      return;
    }
    const available = ordersCache.filter((order) => !order.driverId);
    console.log('[DRIVER FLOW] available queue emit', {
      driverId,
      driverOnline,
      filters: {
        status: 'ready_for_pickup',
        deliveryStatus: 'waiting_driver',
        driverId: null,
      },
      count: available.length,
    });
    onData(available);
  };

  const unsubDriver = onSnapshot(
    driverPresenceDoc(driverId),
    (snap) => {
      const data = snap.data();
      driverOnline = data?.isOnline === true;
      console.log('[ONLINE READ]', {
        driverId,
        path: `${DRIVER_PRESENCE_COLLECTION}/${driverId}`,
        snapshot: data ?? null,
        resolvedIsOnline: driverOnline,
      });
      emit();
    },
    () => {
      driverOnline = false;
      emit();
    },
  );

  const unsubOrders = onSnapshot(
    query(
      collection(db, 'orders'),
      where('status', '==', 'ready_for_pickup'),
      where('deliveryStatus', '==', 'waiting_driver'),
      where('driverId', '==', null),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      ordersCache = snap.docs.map((orderDoc) => mapDispatchOrder(orderDoc));
      console.log('[DRIVER FLOW] dispatch snapshot', {
        count: ordersCache.length,
        statuses: ordersCache.map((o) => ({
          id: o.id,
          status: o.status,
          deliveryStatus: o.deliveryStatus,
          driverId: o.driverId,
          acceptedAtMs: o.acceptedAtMs,
        })),
      });
      emit();
    },
    () => {
      ordersCache = [];
      emit();
    },
  );

  return () => {
    unsubDriver();
    unsubOrders();
  };
}

export async function acceptDelivery(orderId: string, driver: DispatchDriver): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('missing_order');
    const data = snap.data();
    if (data.deliveryStatus === 'delivered' || data.deliveryStatus === 'cancelled') {
      throw new Error('finalized_order');
    }
    if (data.driverId) throw new Error('already_assigned');
    if (data.status !== 'ready_for_pickup' || data.deliveryStatus !== 'waiting_driver') {
      throw new Error('not_dispatchable');
    }

    console.log('[DRIVER FLOW] acceptDelivery before update', {
      orderId,
      status: data.status ?? null,
      deliveryStatus: data.deliveryStatus ?? null,
      driverId: data.driverId ?? null,
      assignedDriverId: data.assignedDriverId ?? null,
      acceptedAt: data.acceptedAt ?? null,
    });

    tx.update(orderRef, {
      driverId: driver.id,
      assignedDriverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone ?? null,
      acceptedAt: serverTimestamp(),
      deliveryStatus: 'driver_assigned',
      status: 'driver_assigned',
      estimatedDeliveryMinutes:
        typeof data.estimatedDeliveryMinutes === 'number' ? data.estimatedDeliveryMinutes : 20,
    });
  });
}

export async function rejectDelivery(orderId: string, driverId: string): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.driverId && data.driverId !== driverId) return;
    if (data.deliveryStatus === 'delivered' || data.deliveryStatus === 'cancelled') return;
    tx.update(orderRef, {
      driverId: null,
      assignedDriverId: null,
      driverName: null,
      driverPhone: null,
      acceptedAt: null,
      deliveryStatus: 'waiting_driver',
      status: 'ready_for_pickup',
    });
  });
}
