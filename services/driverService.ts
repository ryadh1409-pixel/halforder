import {
  collection,
  doc,
  getDoc,
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
  restaurantId: string | null;
  restaurantName: string;
  restaurantImage: string | null;
  restaurantAddress: string | null;
  items: { name: string; qty: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  customerName: string | null;
  customerAvatar: string | null;
  customerPhone: string | null;
  restaurantPhone: string | null;
  restaurantLat: number | null;
  restaurantLng: number | null;
  deliveryAddress: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  itemsSummary?: string;
  createdAt?: unknown;
  notes: string | null;
  restaurantLocation: LatLng | null;
  customerLocation: LatLng | null;
  driverLocation: LatLng | null;
  estimatedDeliveryTime: number;
  distanceKm: number | null;
  acceptedAtMs: number | null;
  createdAtMs: number | null;
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
  if (s === 'payment_processing') return 'payment_processing';
  if (s === 'payment_failed') return 'payment_failed';
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
    s === 'arrived_customer' ||
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
  const createdAtRaw = data.createdAt as { toMillis?: () => number } | undefined;
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
    restaurantId: typeof data.restaurantId === 'string' ? data.restaurantId : null,
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
    restaurantAddress:
      typeof data.restaurantAddress === 'string'
        ? data.restaurantAddress
        : data.restaurantLocation &&
            typeof data.restaurantLocation === 'object' &&
            typeof (data.restaurantLocation as { address?: unknown }).address === 'string'
          ? String((data.restaurantLocation as { address: unknown }).address)
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
    restaurantPhone:
      typeof data.restaurantPhone === 'string'
        ? data.restaurantPhone
        : typeof data.restaurantContactPhone === 'string'
          ? data.restaurantContactPhone
          : null,
    deliveryAddress:
      typeof data.deliveryAddress === 'string'
        ? data.deliveryAddress
        : data.deliveryLocation &&
            typeof data.deliveryLocation === 'object' &&
            typeof (data.deliveryLocation as { address?: unknown }).address === 'string'
          ? String((data.deliveryLocation as { address: unknown }).address)
          : null,
    deliveryLat: dropoffLocation?.lat ?? null,
    deliveryLng: dropoffLocation?.lng ?? null,
    itemsSummary: items.map((item) => `${item.qty}x ${item.name}`).join(', '),
    createdAt: data.createdAt ?? null,
    notes: typeof data.notes === 'string' ? data.notes : null,
    restaurantLocation,
    restaurantLat: restaurantLocation?.lat ?? null,
    restaurantLng: restaurantLocation?.lng ?? null,
    customerLocation: dropoffLocation,
    driverLocation,
    acceptedAtMs:
      acceptedAtRaw && typeof acceptedAtRaw.toMillis === 'function'
        ? acceptedAtRaw.toMillis()
        : null,
    createdAtMs:
      createdAtRaw && typeof createdAtRaw.toMillis === 'function'
        ? createdAtRaw.toMillis()
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
    async (snap) => {
      try {
        const rows = snap.docs
          .map((docSnap) => mapDriverOrder(docSnap))
          .filter((o) => !o.driverId);
        const enrichedRows = await Promise.all(
          rows.map(async (order) => {
            if (!order.restaurantId) return order;
            try {
              const restaurantDoc = await getDoc(doc(db, 'restaurants', order.restaurantId));
              const restaurantData = restaurantDoc.exists()
                ? (restaurantDoc.data() as Record<string, unknown>)
                : null;
              const location =
                restaurantData?.location && typeof restaurantData.location === 'object'
                  ? (restaurantData.location as Record<string, unknown>)
                  : null;
              const restaurantName =
                typeof restaurantData?.name === 'string'
                  ? restaurantData.name
                  : typeof restaurantData?.restaurantName === 'string'
                    ? restaurantData.restaurantName
                    : order.restaurantName || 'Restaurant';
              const restaurantPhone =
                typeof restaurantData?.phone === 'string'
                  ? restaurantData.phone
                  : typeof restaurantData?.phoneNumber === 'string'
                    ? restaurantData.phoneNumber
                    : order.restaurantPhone ?? '';
              const restaurantAddress =
                typeof restaurantData?.address === 'string'
                  ? restaurantData.address
                  : typeof location?.address === 'string'
                    ? location.address
                    : order.restaurantAddress ?? '';
              const restaurantImage =
                typeof restaurantData?.image === 'string'
                  ? restaurantData.image
                  : typeof restaurantData?.logoUrl === 'string'
                    ? restaurantData.logoUrl
                    : order.restaurantImage ?? '';
              const latFromLocation =
                typeof location?.lat === 'number' ? Number(location.lat) : null;
              const lngFromLocation =
                typeof location?.lng === 'number' ? Number(location.lng) : null;
              const restaurantLat =
                latFromLocation ??
                (typeof restaurantData?.lat === 'number'
                  ? Number(restaurantData.lat)
                  : order.restaurantLat);
              const restaurantLng =
                lngFromLocation ??
                (typeof restaurantData?.lng === 'number'
                  ? Number(restaurantData.lng)
                  : order.restaurantLng);
              return {
                ...order,
                restaurantName,
                restaurantPhone,
                restaurantAddress,
                restaurantImage,
                restaurantLat: Number.isFinite(restaurantLat as number) ? (restaurantLat as number) : null,
                restaurantLng: Number.isFinite(restaurantLng as number) ? (restaurantLng as number) : null,
              };
            } catch {
              return order;
            }
          }),
        );
        console.log('[DRIVER FLOW] available snapshot', enrichedRows.length);
        onData(enrichedRows);
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

export async function driverMarkArrivedCustomer(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'arrived_customer',
    estimatedDeliveryTime: 4,
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

export async function updateOrderStatus(
  orderId: string,
  status: 'driver_accepted' | 'picked_up' | 'on_the_way' | 'delivered',
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (status === 'picked_up') updates.pickedUpAt = serverTimestamp();
  if (status === 'delivered') updates.deliveredAt = serverTimestamp();
  await updateDoc(doc(db, 'orders', orderId), updates);
}

export async function acceptOrder(orderId: string, driverId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'driver_accepted',
    driverId,
    driverAcceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
          'arrived_customer',
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
