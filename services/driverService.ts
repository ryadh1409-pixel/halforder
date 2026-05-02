import { db } from './firebase';
import type { OrderStatus } from './orderService';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type DriverProfile = {
  id: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
};

export type DriverOrder = {
  id: string;
  groupId: string | null;
  restaurantName: string;
  items: string[];
  total: number;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string | null;
  driverId: string | null;
};

function normalizeStatus(value: unknown): OrderStatus {
  const s = typeof value === 'string' ? value : '';
  if (
    s === 'awaiting_payment' ||
    s === 'pending' ||
    s === 'accepted' ||
    s === 'preparing' ||
    s === 'ready' ||
    s === 'picked_up' ||
    s === 'on_the_way' ||
    s === 'delivered' ||
    s === 'rejected'
  ) {
    return s;
  }
  return 'pending';
}

function mapDriverOrder(d: { id: string; data: () => Record<string, unknown> }): DriverOrder {
  const data = d.data();
  const items = Array.isArray(data.items)
    ? data.items
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'name' in item) {
            return String((item as { name: unknown }).name);
          }
          return '';
        })
        .filter(Boolean)
    : [];
  return {
    id: d.id,
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    restaurantName:
      typeof data.restaurantName === 'string'
        ? data.restaurantName
        : typeof data.restaurantId === 'string'
          ? data.restaurantId
          : 'Restaurant',
    items,
    total:
      typeof data.totalPrice === 'number'
        ? data.totalPrice
        : typeof data.total === 'number'
          ? data.total
          : 0,
    status: normalizeStatus(data.status),
    customerName: typeof data.customerName === 'string' ? data.customerName : null,
    customerPhone:
      typeof data.customerPhone === 'string'
        ? data.customerPhone
        : typeof data.customerPhoneNumber === 'string'
          ? data.customerPhoneNumber
          : null,
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

export function subscribeDriverOrders(
  driverId: string,
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('driverId', '==', driverId),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      const rows = snap.docs
        .map((docSnap) => mapDriverOrder(docSnap))
        .filter(
          (o) =>
            o.status !== 'delivered' &&
            o.status !== 'rejected' &&
            o.status !== 'pending' &&
            o.status !== 'awaiting_payment',
        );
      onData(rows);
    },
    () => onData([]),
  );
}

/** Orders released by restaurant, waiting for a driver claim. */
export function subscribeAvailableOrders(
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('status', '==', 'ready'),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      const rows = snap.docs
        .map((docSnap) => mapDriverOrder(docSnap))
        .filter((o) => !o.driverId);
      onData(rows);
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
    status: 'preparing',
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
    status: 'ready',
    estimatedDeliveryTime: 18,
  });
}

export async function acceptGroupDelivery(groupId: string, driver: DriverProfile): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where('groupId', '==', groupId),
      where('status', '==', 'ready'),
    ),
  );
  await Promise.all(
    snap.docs.map((orderDoc) =>
      updateDoc(doc(db, 'orders', orderDoc.id), {
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone ?? null,
        status: 'ready',
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
