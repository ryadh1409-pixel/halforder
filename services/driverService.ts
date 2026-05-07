import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { OrderStatus } from './orderService';

export type DriverProfile = {
  id: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
};

export type DriverAssignment = {
  driverId: string;
  driverName: string;
  driverPhone: string | null;
  acceptedAt: unknown;
};

export type DriverOrder = {
  id: string;
  groupId: string | null;
  restaurantName: string;
  restaurantImage: string | null;
  items: { name: string; qty: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  customerName: string | null;
  customerAvatar: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  estimatedDeliveryTime: number;
  distanceKm: number | null;
  acceptedAtMs: number | null;
  driverId: string | null;
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

function normalizeStatus(value: unknown): OrderStatus {
  const s = typeof value === 'string' ? value : '';
  if (
    s === 'awaiting_payment' ||
    s === 'pending' ||
    s === 'pending_driver' ||
    s === 'driver_accepted' ||
    s === 'driver_assigned' ||
    s === 'arriving_restaurant' ||
    s === 'accepted' ||
    s === 'restaurant_accepted' ||
    s === 'preparing' ||
    s === 'ready' ||
    s === 'ready_for_pickup' ||
    s === 'picked_up' ||
    s === 'on_the_way' ||
    s === 'delivered' ||
    s === 'cancelled' ||
    s === 'rejected'
  ) {
    return s;
  }
  return 'pending_driver';
}

function mapDriverOrder(d: { id: string; data: () => Record<string, unknown> }): DriverOrder {
  const data = d.data();
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
  const acceptedAtRaw = data.acceptedAt as { toMillis?: () => number } | undefined;
  const restaurantLocation = parseLatLng(data.restaurantLocation);
  const dropoffLocation =
    parseLatLng(data.userLocation) ??
    parseLatLng(
      data.deliveryLocation && typeof data.deliveryLocation === 'object'
        ? data.deliveryLocation
        : null,
    );
  const driverLocation = parseLatLng(data.driverLocation);
  return {
    id: d.id,
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
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
    items,
    subtotal: typeof data.subtotal === 'number' ? data.subtotal : 0,
    deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
    total:
      typeof data.totalPrice === 'number'
        ? data.totalPrice
        : typeof data.total === 'number'
          ? data.total
          : 0,
    status: normalizeStatus(data.status),
    customerName: typeof data.customerName === 'string' ? data.customerName : null,
    customerAvatar:
      typeof data.customerAvatar === 'string'
        ? data.customerAvatar
        : typeof data.customerPhoto === 'string'
          ? data.customerPhoto
          : null,
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
    acceptedAtMs:
      acceptedAtRaw && typeof acceptedAtRaw.toMillis === 'function'
        ? acceptedAtRaw.toMillis()
        : null,
    estimatedDeliveryTime:
      typeof data.estimatedDeliveryTime === 'number' ? data.estimatedDeliveryTime : 0,
    distanceKm: distanceKm(driverLocation ?? restaurantLocation, dropoffLocation),
    driverId: typeof data.driverId === 'string' ? data.driverId : null,
  };
}

export function subscribeDrivers(
  onData: (drivers: DriverProfile[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'drivers'), orderBy('name', 'asc')),
    (snap) => {
      const rows: DriverProfile[] = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: typeof data.name === 'string' ? data.name : 'Driver',
          phone: typeof data.phone === 'string' ? data.phone : null,
          isOnline: data.isOnline === true,
        };
      });
      onData(rows);
    },
    () => onData([]),
  );
}

export function subscribeToDriverOrders(
  driverId: string,
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  console.log('[DRIVER FLOW] subscribeToDriverOrders', driverId);
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('driverId', '==', driverId),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      try {
        const rows = snap.docs.map((docSnap) => mapDriverOrder(docSnap));
        console.log('[DRIVER FLOW] driver snapshot', rows.length);
        onData(rows);
      } catch (e) {
        console.error('[DRIVER FLOW] subscribeToDriverOrders', e);
        onData([]);
      }
    },
    () => onData([]),
  );
}

/** Orders released by restaurant, waiting for a driver claim. */
export function subscribeAvailableOrders(
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  console.log('[DRIVER FLOW] subscribeAvailableOrders');
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('status', 'in', ['pending_driver', 'ready_for_pickup', 'ready']),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      try {
        const rows = snap.docs
          .map((docSnap) => mapDriverOrder(docSnap))
          .filter((o) => !o.driverId);
        console.log('[DRIVER FLOW] available snapshot', rows.length);
        onData(rows);
      } catch (e) {
        console.error('[DRIVER FLOW] subscribeAvailableOrders', e);
        onData([]);
      }
    },
    () => onData([]),
  );
}

export async function assignDriverToOrder(
  orderId: string,
  driver: DriverProfile,
  _currentStatus: OrderStatus | string,
): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    driverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone ?? null,
    status: 'driver_accepted',
    acceptedAt: serverTimestamp(),
  });
}

/** Driver claims a ready order (still at restaurant until pickup). */
export async function acceptDeliveryOrder(
  orderId: string,
  driver: DriverProfile,
  vehicle?: string | null,
): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    driverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone ?? null,
    ...(vehicle ? { driverVehicle: vehicle } : {}),
    status: 'driver_accepted',
    acceptedAt: serverTimestamp(),
    estimatedDeliveryTime: 18,
  });
}

export async function acceptGroupDelivery(groupId: string, driver: DriverProfile): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where('groupId', '==', groupId),
      where('status', '==', 'pending_driver'),
    ),
  );
  await Promise.all(
    snap.docs.map((orderDoc) =>
      updateDoc(doc(db, 'orders', orderDoc.id), {
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone ?? null,
        status: 'driver_accepted',
        acceptedAt: serverTimestamp(),
        estimatedDeliveryTime: 18,
      }),
    ),
  );
}

export async function driverMarkPickedUp(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'picked_up',
    estimatedDeliveryTime: 14,
  });
}

export async function driverMarkOnTheWay(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'on_the_way',
    estimatedDeliveryTime: 10,
  });
}

export async function markPickedUp(orderId: string): Promise<void> {
  await driverMarkPickedUp(orderId);
}

export async function acceptDriverOrder(
  orderId: string,
  driver: DriverProfile,
): Promise<{ ok: boolean; reason?: string }> {
  console.log('[DRIVER FLOW] acceptDriverOrder', { orderId, driverId: driver.id });
  const orderRef = doc(db, 'orders', orderId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return { ok: false, reason: 'missing' };
    const data = snap.data();
    if (data.driverId) return { ok: false, reason: 'already_assigned' };
    if (data.status !== 'pending_driver') return { ok: false, reason: 'invalid_status' };
    tx.update(orderRef, {
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone ?? null,
      status: 'driver_accepted',
      acceptedAt: serverTimestamp(),
      estimatedDeliveryTime: 24,
    });
    return { ok: true };
  });
}

export function getDriverAvailableOrders(
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  return subscribeAvailableOrders(onData);
}

export function getDriverActiveOrders(
  driverId: string,
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  return subscribeToDriverOrders(driverId, (rows) => {
    onData(
      rows.filter((o) =>
        [
          'driver_assigned',
          'driver_accepted',
          'arriving_restaurant',
          'picked_up_pending',
          'picked_up',
          'on_the_way',
        ].includes(o.status),
      ),
    );
  });
}

// Backward compatible alias
export const subscribeDriverOrders = subscribeToDriverOrders;

export async function updateDriverOnlineStatus(
  driverId: string,
  isOnline: boolean,
): Promise<void> {
  await setDoc(
    doc(db, 'drivers', driverId),
    {
      isOnline,
    },
    { merge: true },
  );
}
