import { safeToMillis, warnDevIfUnparsableTimestamp } from '@/utils/safeToMillis';
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
  customerPhone: string | null;
  deliveryAddress: string | null;
  items: { name: string; qty: number }[];
  estimatedDeliveryTime: number;
  distanceKm: number | null;
  total: number;
  createdAtMs: number | null;
  status: string;
  deliveryStatus: DeliveryStatus;
  driverId: string | null;
  acceptedAtMs: number | null;
};

type LatLng = { lat: number; lng: number };

function parseLatLng(value: unknown): LatLng | null {
  if (!value || typeof value !== 'object') return null;
  const lat = Number((value as { lat?: unknown }).lat);
  const lng = Number((value as { lng?: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceKm(a: LatLng | null, b: LatLng | null): number | null {
  if (!a || !b) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const i =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Number((2 * earthKm * Math.atan2(Math.sqrt(i), Math.sqrt(1 - i))).toFixed(1));
}

export const DRIVER_PRESENCE_COLLECTION = 'drivers';

export function driverPresenceDoc(driverId: string) {
  return doc(db, DRIVER_PRESENCE_COLLECTION, driverId);
}

function mapDispatchOrder(d: { id: string; data: () => Record<string, unknown> }): DispatchOrder {
  const data = d.data();
  warnDevIfUnparsableTimestamp(d.id, 'createdAt', data.createdAt);
  warnDevIfUnparsableTimestamp(d.id, 'acceptedAt', data.acceptedAt);
  const items = Array.isArray(data.items)
    ? data.items
        .map((item) => {
          if (typeof item === 'string') return { name: item, qty: 1 };
          if (item && typeof item === 'object' && 'name' in item) {
            return {
              name: String((item as { name: unknown }).name),
              qty:
                typeof (item as { qty?: unknown }).qty === 'number'
                  ? Number((item as { qty: unknown }).qty)
                  : 1,
            };
          }
          return null;
        })
        .filter((entry): entry is { name: string; qty: number } => Boolean(entry))
    : [];
  const restaurantLocation = parseLatLng(data.restaurantLocation);
  const customerLocation =
    parseLatLng(data.userLocation) ??
    parseLatLng(
      data.deliveryLocation && typeof data.deliveryLocation === 'object'
        ? data.deliveryLocation
        : null,
    );
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
    customerPhone:
      typeof data.customerPhone === 'string'
        ? data.customerPhone
        : typeof data.customerPhoneNumber === 'string'
          ? data.customerPhoneNumber
          : null,
    deliveryAddress:
      typeof data.deliveryAddress === 'string'
        ? data.deliveryAddress
        : data.deliveryLocation &&
            typeof data.deliveryLocation === 'object' &&
            typeof (data.deliveryLocation as { address?: unknown }).address === 'string'
          ? String((data.deliveryLocation as { address: unknown }).address)
          : null,
    items,
    estimatedDeliveryTime:
      typeof data.estimatedDeliveryTime === 'number' ? data.estimatedDeliveryTime : 20,
    distanceKm: distanceKm(restaurantLocation, customerLocation),
    total:
      typeof data.totalPrice === 'number'
        ? data.totalPrice
        : typeof data.total === 'number'
          ? data.total
          : 0,
    createdAtMs: safeToMillis(data.createdAt),
    status: typeof data.status === 'string' ? data.status : 'ready_for_pickup',
    deliveryStatus: normalizeDeliveryStatus(data.deliveryStatus),
    driverId: typeof data.driverId === 'string' ? data.driverId : null,
    acceptedAtMs: safeToMillis(data.acceptedAt),
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
        status: 'pending_driver',
        deliveryType: 'delivery',
        driverId: null,
        assignedDriverId: null,
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
      where('status', '==', 'pending_driver'),
      where('deliveryType', '==', 'delivery'),
      where('driverId', '==', null),
      where('assignedDriverId', '==', null),
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
    (error) => {
      console.error('[QUERY FAILED]', {
        file: 'services/driverDispatch.ts',
        collection: 'orders',
        listener: 'driverDispatch.subscribeAvailableOrders',
        filters: [
          ['status', '==', 'pending_driver'],
          ['deliveryType', '==', 'delivery'],
          ['driverId', '==', null],
          ['assignedDriverId', '==', null],
          ['orderBy', 'createdAt desc'],
        ],
        error,
      });
      ordersCache = [];
      emit();
    },
  );

  if (__DEV__) {
    console.log('[QUERY START]', {
      file: 'services/driverDispatch.ts',
      collection: 'orders',
      listener: 'driverDispatch.subscribeAvailableOrders',
      filters: [
        ['status', '==', 'pending_driver'],
        ['deliveryType', '==', 'delivery'],
        ['driverId', '==', null],
        ['assignedDriverId', '==', null],
        ['orderBy', 'createdAt desc'],
      ],
      authUid: driverId,
      role: 'driver',
    });
  }

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
