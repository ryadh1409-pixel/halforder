import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type RestaurantDoc = {
  id: string;
  name: string;
  logo: string | null;
  location: string;
  isOpen: boolean;
  ownerId: string;
};

export type MenuItemDoc = {
  id: string;
  restaurantId: string;
  name: string;
  price: number;
  image: string | null;
  isAvailable: boolean;
};

export type DriverDoc = {
  id: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
  location?: { latitude: number; longitude: number } | null;
};

export type RestaurantOrderStatus = 'pending' | 'preparing' | 'ready' | 'picked_up';

export type RestaurantOrderDoc = {
  id: string;
  restaurantId: string;
  customerId: string | null;
  customerPhone: string | null;
  items: string[];
  total: number;
  status: RestaurantOrderStatus;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  createdAtLabel: string;
};

function toCreatedAtLabel(value: unknown): string {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return 'Now';
}

export function subscribeRestaurantByOwner(
  ownerId: string,
  onData: (restaurant: RestaurantDoc | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'restaurants', ownerId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        id: ownerId,
        name: typeof data.name === 'string' ? data.name : 'My Restaurant',
        logo: typeof data.logo === 'string' ? data.logo : null,
        location: typeof data.location === 'string' ? data.location : '',
        isOpen: data.isOpen !== false,
        ownerId,
      });
    },
    () => onData(null),
  );
}

export async function createRestaurantProfile(payload: {
  ownerId: string;
  name: string;
  logo: string | null;
  location: string;
}): Promise<string> {
  const ref = doc(db, 'restaurants', payload.ownerId);
  await setDoc(ref, {
    name: payload.name.trim(),
    logo: payload.logo ?? null,
    location: payload.location.trim(),
    isOpen: true,
    ownerId: payload.ownerId,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'users', payload.ownerId), { restaurantId: payload.ownerId });
  return payload.ownerId;
}

export function subscribeRestaurantOrders(
  restaurantId: string,
  onData: (orders: RestaurantOrderDoc[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('restaurantId', '==', restaurantId),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      const rows: RestaurantOrderDoc[] = snap.docs.map((d) => {
        const data = d.data();
        const status = data.status;
        const safeStatus: RestaurantOrderStatus =
          status === 'pending' ||
          status === 'ready' ||
          status === 'picked_up' ||
          status === 'preparing'
            ? status
            : 'preparing';
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
          restaurantId,
          customerId: typeof data.customerId === 'string' ? data.customerId : null,
          customerPhone:
            typeof data.customerPhone === 'string'
              ? data.customerPhone
              : typeof data.customerPhoneNumber === 'string'
                ? data.customerPhoneNumber
                : null,
          items,
          total: typeof data.total === 'number' ? data.total : 0,
          status: safeStatus,
          driverId: typeof data.driverId === 'string' ? data.driverId : null,
          driverName: typeof data.driverName === 'string' ? data.driverName : null,
          driverPhone: typeof data.driverPhone === 'string' ? data.driverPhone : null,
          createdAtLabel: toCreatedAtLabel(data.createdAt),
        };
      });
      onData(rows);
    },
    () => onData([]),
  );
}

export function subscribeRestaurantMenuItems(
  restaurantId: string,
  onData: (items: MenuItemDoc[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'menuItems'),
      where('restaurantId', '==', restaurantId),
      orderBy('name', 'asc'),
    ),
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            restaurantId,
            name: typeof data.name === 'string' ? data.name : 'Unnamed item',
            price: typeof data.price === 'number' ? data.price : 0,
            image: typeof data.image === 'string' ? data.image : null,
            isAvailable: data.isAvailable !== false,
          };
        }),
      );
    },
    () => onData([]),
  );
}

export function subscribeOnlineDrivers(onData: (drivers: DriverDoc[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'drivers'), where('isOnline', '==', true)),
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: typeof data.name === 'string' ? data.name : 'Driver',
            phone: typeof data.phone === 'string' ? data.phone : null,
            isOnline: true,
            location:
              data.location &&
              typeof data.location === 'object' &&
              'latitude' in data.location &&
              'longitude' in data.location
                ? {
                    latitude: Number(
                      (data.location as { latitude: unknown }).latitude,
                    ),
                    longitude: Number(
                      (data.location as { longitude: unknown }).longitude,
                    ),
                  }
                : null,
          };
        }),
      );
    },
    () => onData([]),
  );
}

export async function updateRestaurantOpen(
  restaurantId: string,
  isOpen: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'restaurants', restaurantId), { isOpen });
}

export async function markOrderReady(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), { status: 'ready' });
}

export async function assignDriverToOrder(
  orderId: string,
  driver: { id: string; name: string; phone: string | null },
): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    driverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone ?? null,
  });
}

export async function markOrderPickedUp(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), { status: 'picked_up' });
}

export async function addMenuItem(payload: {
  restaurantId: string;
  name: string;
  price: number;
  image: string | null;
  isAvailable: boolean;
}): Promise<void> {
  await addDoc(collection(db, 'menuItems'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
}

export async function updateMenuItem(
  itemId: string,
  updates: Partial<Pick<MenuItemDoc, 'name' | 'price' | 'image' | 'isAvailable'>>,
): Promise<void> {
  await updateDoc(doc(db, 'menuItems', itemId), updates);
}

export async function deleteMenuItem(itemId: string): Promise<void> {
  await deleteDoc(doc(db, 'menuItems', itemId));
}

export async function contactCustomer(payload: {
  orderId: string;
  customerId: string | null;
  restaurantId: string;
}): Promise<void> {
  await addDoc(collection(db, 'messages'), {
    orderId: payload.orderId,
    customerId: payload.customerId,
    restaurantId: payload.restaurantId,
    text: 'Hi! Your order is being prepared.',
    senderRole: 'restaurant',
    createdAt: serverTimestamp(),
  });
}

export function subscribeDriverAssignedOrders(
  driverId: string,
  onData: (orders: RestaurantOrderDoc[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('driverId', '==', driverId),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      const rows: RestaurantOrderDoc[] = snap.docs.map((d) => {
        const data = d.data();
        const status = data.status;
        const safeStatus: RestaurantOrderStatus =
          status === 'pending' ||
          status === 'ready' ||
          status === 'picked_up' ||
          status === 'preparing'
            ? status
            : 'preparing';
        return {
          id: d.id,
          restaurantId:
            typeof data.restaurantId === 'string' ? data.restaurantId : '',
          customerId: typeof data.customerId === 'string' ? data.customerId : null,
          customerPhone:
            typeof data.customerPhone === 'string' ? data.customerPhone : null,
          items: Array.isArray(data.items)
            ? data.items.map((x) => String(x)).filter(Boolean)
            : [],
          total: typeof data.total === 'number' ? data.total : 0,
          status: safeStatus,
          driverId,
          driverName: typeof data.driverName === 'string' ? data.driverName : null,
          driverPhone: typeof data.driverPhone === 'string' ? data.driverPhone : null,
          createdAtLabel: toCreatedAtLabel(data.createdAt),
        };
      });
      onData(rows);
    },
    () => onData([]),
  );
}
