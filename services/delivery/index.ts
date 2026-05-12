import {
  ACTIVE_DELIVERY_STATUSES,
  DELIVERY_STATUS,
  type DeliveryLifecycleStatus,
  normalizeDeliveryLifecycleStatus,
} from '@/constants/deliveryStatus';
import { db } from '@/services/firebase';
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

type LatLng = { lat: number; lng: number };

export type DeliveryLocation = LatLng & {
  heading?: number | null;
  speed?: number | null;
  updatedAt?: unknown;
};

export type DriverIdentity = {
  id: string;
  name: string;
  phone: string | null;
};

export type DeliveryQueueOrder = {
  id: string;
  restaurantName: string;
  restaurantImage: string | null;
  restaurantPhone: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  items: { name: string; qty: number; image?: string | null; modifiers?: string[] }[];
  itemCount: number;
  subtotal: number;
  fees: number;
  payout: number;
  distanceKm: number | null;
  estimatedDurationMin: number;
  orderAgeMin: number;
  createdAtMs: number | null;
  status: string;
  deliveryStatus: DeliveryLifecycleStatus;
};

export type ActiveDelivery = DeliveryQueueOrder & {
  assignedDriverId: string | null;
  acceptedAtMs: number | null;
  pickedUpAtMs: number | null;
  deliveredAtMs: number | null;
  notes: string | null;
  customerInstructions: string | null;
  pickupNotes: string | null;
  restaurantAddress: string | null;
  restaurantLocation: LatLng | null;
  customerLocation: LatLng | null;
  driverLocation: DeliveryLocation | null;
  timeline: { type: string; actor: string; at: number | null; note: string | null }[];
  driverName: string | null;
  driverPhone: string | null;
};

function toMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const fn = (value as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') return fn();
  }
  return null;
}

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
  const r = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Number((2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))).toFixed(1));
}

function mapItems(raw: unknown): DeliveryQueueOrder['items'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name : 'Item';
      const qty = typeof row.qty === 'number' ? row.qty : 1;
      const image = typeof row.image === 'string' ? row.image : null;
      const modifiers = Array.isArray(row.modifiers)
        ? row.modifiers.filter((v): v is string => typeof v === 'string')
        : [];
      return { name, qty, image, modifiers };
    })
    .filter((item): item is DeliveryQueueOrder['items'][number] => Boolean(item));
}

function mapQueueOrder(d: { id: string; data: () => Record<string, unknown> }): DeliveryQueueOrder {
  const data = d.data();
  const createdAtMs = toMillis(data.createdAt);
  const restaurantLocation = parseLatLng(data.restaurantLocation);
  const customerLocation =
    parseLatLng(data.userLocation) ??
    parseLatLng(
      data.deliveryLocation && typeof data.deliveryLocation === 'object' ? data.deliveryLocation : null,
    );
  const driverLocation = parseLatLng(data.driverLocation);
  const items = mapItems(data.items);
  const subtotal = typeof data.subtotal === 'number' ? data.subtotal : 0;
  const fees = typeof data.deliveryFee === 'number' ? data.deliveryFee : 0;
  const payout =
    typeof data.totalPrice === 'number'
      ? data.totalPrice
      : typeof data.total === 'number'
        ? data.total
        : subtotal + fees;
  return {
    id: d.id,
    restaurantName:
      typeof data.restaurantName === 'string'
        ? data.restaurantName
        : typeof data.restaurantId === 'string'
          ? data.restaurantId
          : 'Restaurant',
    restaurantImage: typeof data.restaurantImage === 'string' ? data.restaurantImage : null,
    restaurantPhone:
      typeof data.restaurantPhone === 'string'
        ? data.restaurantPhone
        : typeof data.restaurantContactPhone === 'string'
          ? data.restaurantContactPhone
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
    itemCount: items.reduce((sum, item) => sum + item.qty, 0),
    subtotal,
    fees,
    payout,
    distanceKm: distanceKm(driverLocation ?? restaurantLocation, customerLocation),
    estimatedDurationMin:
      typeof data.estimatedDeliveryTime === 'number'
        ? data.estimatedDeliveryTime
        : typeof data.estimatedDeliveryMinutes === 'number'
          ? data.estimatedDeliveryMinutes
          : 20,
    orderAgeMin: createdAtMs ? Math.max(0, Math.round((Date.now() - createdAtMs) / 60000)) : 0,
    createdAtMs,
    status: typeof data.status === 'string' ? data.status : 'pending_driver',
    deliveryStatus: normalizeDeliveryLifecycleStatus(data.deliveryStatus),
  };
}

function mapActiveDelivery(
  d: { id: string; data: () => Record<string, unknown> },
): ActiveDelivery {
  const base = mapQueueOrder(d);
  const data = d.data();
  const timelineRaw = Array.isArray(data.timeline) ? data.timeline : [];
  return {
    ...base,
    assignedDriverId:
      typeof data.assignedDriverId === 'string'
        ? data.assignedDriverId
        : typeof data.driverId === 'string'
          ? data.driverId
          : null,
    acceptedAtMs: toMillis(data.acceptedAt),
    pickedUpAtMs: toMillis(data.pickedUpAt),
    deliveredAtMs: toMillis(data.deliveredAt),
    notes: typeof data.notes === 'string' ? data.notes : null,
    customerInstructions:
      typeof data.customerInstructions === 'string' ? data.customerInstructions : null,
    pickupNotes: typeof data.pickupNotes === 'string' ? data.pickupNotes : null,
    restaurantAddress:
      typeof data.restaurantAddress === 'string'
        ? data.restaurantAddress
        : typeof data.restaurantLocationAddress === 'string'
          ? data.restaurantLocationAddress
          : null,
    restaurantLocation: parseLatLng(data.restaurantLocation),
    customerLocation:
      parseLatLng(data.userLocation) ??
      parseLatLng(
        data.deliveryLocation && typeof data.deliveryLocation === 'object'
          ? data.deliveryLocation
          : null,
      ),
    driverLocation:
      data.driverLocation && typeof data.driverLocation === 'object'
        ? ({
            ...parseLatLng(data.driverLocation),
            heading:
              typeof (data.driverLocation as { heading?: unknown }).heading === 'number'
                ? Number((data.driverLocation as { heading: number }).heading)
                : null,
            speed:
              typeof (data.driverLocation as { speed?: unknown }).speed === 'number'
                ? Number((data.driverLocation as { speed: number }).speed)
                : null,
            updatedAt: (data.driverLocation as { updatedAt?: unknown }).updatedAt ?? null,
          } as DeliveryLocation)
        : null,
    timeline: timelineRaw
      .map((event) => {
        if (!event || typeof event !== 'object') return null;
        const row = event as Record<string, unknown>;
        return {
          type: typeof row.type === 'string' ? row.type : 'event',
          actor: typeof row.actor === 'string' ? row.actor : 'system',
          at: toMillis(row.at),
          note: typeof row.note === 'string' ? row.note : null,
        };
      })
      .filter((v): v is ActiveDelivery['timeline'][number] => Boolean(v)),
    driverName: typeof data.driverName === 'string' ? data.driverName : null,
    driverPhone: typeof data.driverPhone === 'string' ? data.driverPhone : null,
  };
}

function toLegacyDeliveryStatus(status: DeliveryLifecycleStatus): string {
  switch (status) {
    case DELIVERY_STATUS.AVAILABLE:
      return 'waiting_driver';
    case DELIVERY_STATUS.ACCEPTED:
      return 'driver_assigned';
    case DELIVERY_STATUS.ARRIVED_AT_RESTAURANT:
      return 'arrived_restaurant';
    case DELIVERY_STATUS.PICKED_UP:
      return 'picked_up';
    case DELIVERY_STATUS.ON_THE_WAY:
      return 'on_the_way';
    case DELIVERY_STATUS.ARRIVED_CUSTOMER:
      return 'near_customer';
    case DELIVERY_STATUS.DELIVERED:
      return 'delivered';
    case DELIVERY_STATUS.CANCELLED:
      return 'cancelled';
  }
}

function toLegacyOrderStatus(status: DeliveryLifecycleStatus): string {
  switch (status) {
    case DELIVERY_STATUS.AVAILABLE:
      return 'pending_driver';
    case DELIVERY_STATUS.ACCEPTED:
      return 'driver_assigned';
    case DELIVERY_STATUS.ARRIVED_AT_RESTAURANT:
      return 'arriving_restaurant';
    case DELIVERY_STATUS.PICKED_UP:
      return 'picked_up';
    case DELIVERY_STATUS.ON_THE_WAY:
      return 'on_the_way';
    case DELIVERY_STATUS.ARRIVED_CUSTOMER:
      return 'arrived_customer';
    case DELIVERY_STATUS.DELIVERED:
      return 'delivered';
    case DELIVERY_STATUS.CANCELLED:
      return 'cancelled';
  }
}

export function subscribeDriverQueue(
  driverId: string,
  onData: (orders: DeliveryQueueOrder[]) => void,
): Unsubscribe {
  let online = false;
  let cache: DeliveryQueueOrder[] = [];
  const emit = () => {
    if (!online) {
      onData([]);
      return;
    }
    const unique = Array.from(new Map(cache.map((row) => [row.id, row])).values());
    unique.sort((a, b) => {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
    onData(unique);
  };

  const unsubDriver = onSnapshot(doc(db, 'drivers', driverId), (snap) => {
    online = snap.data()?.isOnline === true || snap.data()?.online === true;
    emit();
  });

  const unsubOrders = onSnapshot(
    query(
      collection(db, 'orders'),
      where('status', 'in', ['pending_driver', 'ready_for_pickup', 'ready']),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      cache = snap.docs
        .map((row) => mapQueueOrder(row))
        .filter((row) => row.deliveryStatus === DELIVERY_STATUS.AVAILABLE)
        .filter((row) => row.status !== 'cancelled');
      emit();
    },
    () => {
      cache = [];
      emit();
    },
  );

  return () => {
    unsubDriver();
    unsubOrders();
  };
}

export async function acceptOrderWithLock(orderId: string, driver: DriverIdentity): Promise<void> {
  const ref = doc(db, 'orders', orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('missing_order');
    const data = snap.data();
    if (data.assignedDriverId || data.driverId) throw new Error('already_assigned');
    const status = normalizeDeliveryLifecycleStatus(data.deliveryStatus);
    if (status !== DELIVERY_STATUS.AVAILABLE) throw new Error('not_available');

    tx.update(ref, {
      assignedDriverId: driver.id,
      assignedAt: serverTimestamp(),
      acceptedAt: serverTimestamp(),
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone ?? null,
      deliveryStatus: DELIVERY_STATUS.ACCEPTED,
      legacyDeliveryStatus: toLegacyDeliveryStatus(DELIVERY_STATUS.ACCEPTED),
      status: toLegacyOrderStatus(DELIVERY_STATUS.ACCEPTED),
      timeline: arrayUnion({
        type: 'accepted',
        actor: 'driver',
        actorId: driver.id,
        at: serverTimestamp(),
        note: 'Order accepted by driver',
      }),
    });

    tx.set(
      doc(db, 'drivers', driver.id),
      {
        currentOrderId: orderId,
        activeDeliveryStatus: DELIVERY_STATUS.ACCEPTED,
        online: true,
        isOnline: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function declineOrder(orderId: string, driverId: string): Promise<void> {
  await setDoc(
    doc(db, 'orders', orderId, 'driverDeclines', driverId),
    { createdAt: serverTimestamp(), driverId },
    { merge: true },
  );
}

export function subscribeActiveDelivery(
  orderId: string,
  onData: (order: ActiveDelivery | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'orders', orderId), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    onData(mapActiveDelivery({ id: snap.id, data: () => snap.data() as Record<string, unknown> }));
  });
}

export function subscribeDriverActiveOrders(
  driverId: string,
  onData: (orders: ActiveDelivery[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'orders'), where('assignedDriverId', '==', driverId), orderBy('createdAt', 'desc')),
    (snap) => {
      const rows = snap.docs
        .map((d) => mapActiveDelivery(d))
        .filter((order) => ACTIVE_DELIVERY_STATUSES.includes(order.deliveryStatus));
      onData(rows);
    },
    () => onData([]),
  );
}

export async function updateDeliveryStatus(
  orderId: string,
  driverId: string,
  nextStatus: DeliveryLifecycleStatus,
): Promise<void> {
  const ref = doc(db, 'orders', orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('missing_order');
    const data = snap.data();
    const assignedDriverId =
      typeof data.assignedDriverId === 'string'
        ? data.assignedDriverId
        : typeof data.driverId === 'string'
          ? data.driverId
          : null;
    if (assignedDriverId !== driverId) throw new Error('not_assigned_driver');
    const currentStatus = normalizeDeliveryLifecycleStatus(data.deliveryStatus);
    if (currentStatus === DELIVERY_STATUS.CANCELLED || currentStatus === DELIVERY_STATUS.DELIVERED) {
      throw new Error('delivery_finalized');
    }

    const patch: Record<string, unknown> = {
      deliveryStatus: nextStatus,
      legacyDeliveryStatus: toLegacyDeliveryStatus(nextStatus),
      status: toLegacyOrderStatus(nextStatus),
      timeline: arrayUnion({
        type: nextStatus,
        actor: 'driver',
        actorId: driverId,
        at: serverTimestamp(),
      }),
      updatedAt: serverTimestamp(),
    };
    if (nextStatus === DELIVERY_STATUS.PICKED_UP) patch.pickedUpAt = serverTimestamp();
    if (nextStatus === DELIVERY_STATUS.DELIVERED) patch.deliveredAt = serverTimestamp();
    tx.update(ref, patch);
    tx.set(
      doc(db, 'drivers', driverId),
      {
        currentOrderId: nextStatus === DELIVERY_STATUS.DELIVERED ? null : orderId,
        activeDeliveryStatus: nextStatus,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function updateDriverLiveLocation(
  orderId: string,
  driverId: string,
  location: DeliveryLocation,
): Promise<void> {
  const payload = {
    lat: location.lat,
    lng: location.lng,
    heading: typeof location.heading === 'number' ? location.heading : null,
    speed: typeof location.speed === 'number' ? location.speed : null,
    updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.update(doc(db, 'orders', orderId), { driverLocation: payload });
  batch.set(
    doc(db, 'live_locations', orderId),
    {
      orderId,
      driverId,
      ...payload,
    },
    { merge: true },
  );
  batch.set(
    doc(db, 'drivers', driverId),
    {
      liveLocation: payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
}

export async function setDriverOnlineAvailability(
  driverId: string,
  online: boolean,
): Promise<void> {
  await setDoc(
    doc(db, 'drivers', driverId),
    {
      isOnline: online,
      online,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
