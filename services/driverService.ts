import {
  collection,
  doc,
  getDocs,
  limit,
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
import { ensureAuthRoleClaim } from '@/services/authRoleClaims';
import { acceptOrderWithLock } from '@/services/delivery';
import { safeToMillis, warnDevIfUnparsableTimestamp } from '@/utils/safeToMillis';
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
  warnDevIfUnparsableTimestamp(d.id, 'acceptedAt', data.acceptedAt);
  warnDevIfUnparsableTimestamp(d.id, 'createdAt', data.createdAt);
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
    acceptedAtMs: safeToMillis(data.acceptedAt),
    createdAtMs: safeToMillis(data.createdAt),
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
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  void (async () => {
    try {
      await ensureAuthRoleClaim('driver');
    } catch {
      /* listener may still work for assigned orders via driverId rule */
    }
    if (cancelled) return;

    unsub = onSnapshot(
      query(
        collection(db, 'orders'),
        where('driverId', '==', driverId),
        where('deliveryType', '==', 'delivery'),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => {
        try {
          const rows = snap.docs.map((docSnap) => mapDriverOrder(docSnap));
          onData(rows);
        } catch {
          onData([]);
        }
      },
      () => {
        onData([]);
      },
    );
  })().catch(() => {
    onData([]);
  });

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export type DriverDeliveryStats = {
  deliveries: number;
  earnings: number;
  rating: number;
};

/**
 * Paid delivery queue: awaiting driver (`pending_driver`), unassigned, delivery only.
 */
export function subscribeAvailableOrders(
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  void (async () => {
    try {
      await ensureAuthRoleClaim('driver');
    } catch {
      /* claims refresh best-effort */
    }
    if (cancelled) return;

    unsub = onSnapshot(
      query(
        collection(db, 'orders'),
        where('status', '==', 'pending_driver'),
        where('deliveryType', '==', 'delivery'),
        where('driverId', '==', null),
        where('assignedDriverId', '==', null),
        orderBy('createdAt', 'desc'),
        limit(20),
      ),
      (snap) => {
        try {
          const rows = snap.docs.map((docSnap) => mapDriverOrder(docSnap));
          onData(rows);
        } catch {
          onData([]);
        }
      },
      () => {
        onData([]);
      },
    );
  })().catch(() => {
    onData([]);
  });

  return () => {
    cancelled = true;
    unsub?.();
  };
}

/** Completed deliveries + earnings for driver dashboard stats. */
export function subscribeDriverDeliveryStats(
  driverId: string,
  onStats: (stats: DriverDeliveryStats) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('driverId', '==', driverId),
      where('status', '==', 'delivered'),
      where('deliveryType', '==', 'delivery'),
    ),
    (snap) => {
      let earnings = 0;
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const fee =
          typeof data.deliveryFee === 'number' && Number.isFinite(data.deliveryFee)
            ? data.deliveryFee
            : 0;
        earnings += fee;
      }
      onStats({
        deliveries: snap.size,
        earnings: Math.round(earnings * 100) / 100,
        rating: 5.0,
      });
    },
    () => {
      onStats({ deliveries: 0, earnings: 0, rating: 5.0 });
    },
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

/**
 * Driver claims a paid matching-queue order (`pending_driver`) or a restaurant-released dispatch order (`ready_for_pickup` + `waiting_driver`).
 * Updates embedded `driver` snapshot for customer/restaurant UIs.
 */
export async function claimMarketplaceDriverOrder(
  orderId: string,
  driver: DriverProfile,
  vehicle?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const orderRef = doc(db, 'orders', orderId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return { ok: false, reason: 'missing' };
    const data = snap.data();
    if (typeof data.driverId === 'string' && data.driverId.length > 0) {
      return { ok: false, reason: 'already_assigned' };
    }

    const existingPin =
      typeof data.deliveryPin === 'string' && /^\d{4}$/.test(data.deliveryPin)
        ? data.deliveryPin
        : null;
    const deliveryPin = existingPin ?? String(1000 + Math.floor(Math.random() * 9000));

    const status = typeof data.status === 'string' ? data.status : '';
    const deliveryStatus = typeof data.deliveryStatus === 'string' ? data.deliveryStatus : '';
    const paid = data.paymentStatus === 'paid';

    const driverBlob = {
      id: driver.id,
      name: driver.name,
      phone: driver.phone ?? null,
      vehicle: vehicle ?? null,
      avatar: null as string | null,
    };

    if (paid && status === 'pending_driver') {
      tx.update(orderRef, {
        driverId: driver.id,
        assignedDriverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone ?? null,
        ...(vehicle ? { driverVehicle: vehicle } : {}),
        driver: driverBlob,
        status: 'driver_accepted',
        deliveryStatus: 'heading_to_restaurant',
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        estimatedDeliveryTime:
          typeof data.estimatedDeliveryTime === 'number' ? data.estimatedDeliveryTime : 24,
        deliveryPin,
      });
      return { ok: true };
    }

    if (
      (status === 'ready_for_pickup' || status === 'ready') &&
      deliveryStatus === 'waiting_driver'
    ) {
      tx.update(orderRef, {
        driverId: driver.id,
        assignedDriverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone ?? null,
        ...(vehicle ? { driverVehicle: vehicle } : {}),
        driver: driverBlob,
        status: 'driver_assigned',
        deliveryStatus: 'driver_assigned',
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        estimatedDeliveryTime:
          typeof data.estimatedDeliveryTime === 'number' ? data.estimatedDeliveryTime : 18,
        deliveryPin,
      });
      return { ok: true };
    }

    return { ok: false, reason: 'invalid_state' };
  });
}

/**
 * Prefer marketplace Firestore rules-friendly assign (`claimMarketplaceDriverOrder`);
 * fall back to legacy dispatch lifecycle (`acceptOrderWithLock`) when appropriate.
 */
export async function acceptQueuedDeliveryOrder(
  orderId: string,
  driver: DriverProfile,
  vehicle?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const mp = await claimMarketplaceDriverOrder(orderId, driver, vehicle);
  if (mp.ok) return mp;
  if (mp.reason !== 'invalid_state' && mp.reason !== 'missing') return mp;
  try {
    await acceptOrderWithLock(orderId, {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'accept_failed' };
  }
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
  const ts = serverTimestamp();
  await Promise.all([
    setDoc(
      doc(db, 'drivers', driverId),
      { isOnline, online: isOnline, lastActive: ts },
      { merge: true },
    ),
    setDoc(
      doc(db, 'users', driverId),
      { online: isOnline, lastActive: ts },
      { merge: true },
    ),
  ]);
}
