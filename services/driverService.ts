import { db } from '@/services/firebase';
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
  status:
    | 'pending'
    | 'accepted'
    | 'preparing'
    | 'ready'
    | 'on_the_way'
    | 'delivered'
    | 'picked_up';
  customerName: string | null;
  customerPhone: string | null;
  driverId: string | null;
};

function normalizeStatus(value: unknown): DriverOrder['status'] {
  return value === 'pending' ||
    value === 'accepted' ||
    value === 'ready' ||
    value === 'on_the_way' ||
    value === 'delivered' ||
    value === 'picked_up' ||
    value === 'preparing'
    ? value
    : 'preparing';
}

export function subscribeDrivers(
  onData: (drivers: DriverProfile[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'drivers'), orderBy('name', 'asc')),
    (snap) => {
      const rows: DriverProfile[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
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
      const rows: DriverOrder[] = snap.docs.map((d) => {
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
          customerName:
            typeof data.customerName === 'string' ? data.customerName : null,
          customerPhone:
            typeof data.customerPhone === 'string'
              ? data.customerPhone
              : typeof data.customerPhoneNumber === 'string'
                ? data.customerPhoneNumber
                : null,
          driverId: typeof data.driverId === 'string' ? data.driverId : null,
        };
      });
      onData(rows);
    },
    () => onData([]),
  );
}

export async function assignDriverToOrder(
  orderId: string,
  driver: DriverProfile,
  currentStatus: DriverOrder['status'] | string,
): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    driverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone ?? null,
    status: currentStatus === 'preparing' ? currentStatus : 'preparing',
  });
}

export async function markPickedUp(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), { status: 'picked_up' });
}

export function subscribeAvailableOrders(
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('status', '==', 'accepted'),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      const rows: DriverOrder[] = snap.docs
        .map((d) => {
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
            customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : null,
            driverId: typeof data.driverId === 'string' ? data.driverId : null,
          };
        })
        .filter((order) => !order.driverId);
      onData(rows);
    },
    () => onData([]),
  );
}

export async function acceptDeliveryOrder(orderId: string, driver: DriverProfile): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    driverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone ?? null,
    status: 'on_the_way',
    estimatedDeliveryTime: 12,
  });
}

export async function acceptGroupDelivery(groupId: string, driver: DriverProfile): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where('groupId', '==', groupId),
      where('status', '==', 'accepted'),
    ),
  );
  await Promise.all(
    snap.docs.map((orderDoc) =>
      updateDoc(doc(db, 'orders', orderDoc.id), {
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone ?? null,
        status: 'on_the_way',
        estimatedDeliveryTime: 12,
      }),
    ),
  );
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
