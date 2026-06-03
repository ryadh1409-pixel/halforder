import {
  ACTIVE_DELIVERY_STATUSES,
  DELIVERY_STATUS,
  type DeliveryLifecycleStatus,
  normalizeDeliveryLifecycleStatus,
} from '@/constants/deliveryStatus';
import { ensureAuthRoleClaim } from '@/services/authRoleClaims';
import {
  driverPresenceDoc,
  ensureDriverPresenceDoc,
  resolveDriverOnline,
} from '@/services/driverPresence';
import {
  isFirestorePermissionDenied,
  logDriverQueryError,
  logDriverQueryStart,
} from '@/services/firestoreDriverQueryLog';
import { auth, db } from '@/services/firebase';
import { syncDriverLiveLocation } from '@/services/location/driverTracking';
import { tracedTransactionUpdateOrder } from '@/services/orderFirestoreWrite';
import { marketplaceLog } from '@/lib/marketplaceLogger';
import { isDriverPoolRowStale } from '@/lib/marketplacePoolAge';
import { runListenerBootstrap, safeListenerError } from '@/utils/safeFirestoreListener';
import { warnDevIfUnparsableTimestamp } from '@/utils/safeToMillis';
import {
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

function safeToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof (value as any).toMillis === 'function') return (value as any).toMillis();
  if (typeof (value as any).seconds === 'number') return (value as any).seconds * 1000;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof value === 'number') return value > 1e10 ? value : value * 1000;
  return null;
}

type LatLng = { lat: number; lng: number };

function isPermissionDeniedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'permission-denied'
  );
}

function logDeliveryListenError(context: string, error: unknown): void {
  if (__DEV__) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined;
    // eslint-disable-next-line no-console
    console.warn('[delivery] Firestore listener error', { context, code, error });
  }
}

function warnMalformedDeliveryDoc(docId: string, phase: string, err: unknown): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.warn('[delivery] Malformed or unmappable Firestore document', {
    docId,
    phase,
    error: err,
  });
}

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
  const out: DeliveryQueueOrder['items'] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name : 'Item';
    const qty = typeof row.qty === 'number' && Number.isFinite(row.qty) ? row.qty : 1;
    const image = typeof row.image === 'string' ? row.image : null;
    const modifiers = Array.isArray(row.modifiers)
      ? row.modifiers.filter((v): v is string => typeof v === 'string')
      : [];
    out.push({ name, qty, image, modifiers });
  }
  return out;
}

function mapQueueOrder(d: { id: string; data: () => Record<string, unknown> }): DeliveryQueueOrder {
  const data = d.data() ?? {};
  const createdAtMs = safeToMillis(data.createdAt);
  warnDevIfUnparsableTimestamp(d.id, 'createdAt', data.createdAt);
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
    orderAgeMin:
      createdAtMs != null
        ? Math.max(0, Math.round((Date.now() - createdAtMs) / 60000))
        : 0,
    /** Unknown creation time when Firestore value is missing or invalid (UI should tolerate null). */
    createdAtMs,
    status: typeof data.status === 'string' ? data.status : 'pending_driver',
    deliveryStatus: normalizeDeliveryLifecycleStatus(data.deliveryStatus),
  };
}

function mapActiveDelivery(
  d: { id: string; data: () => Record<string, unknown> },
): ActiveDelivery {
  const base = mapQueueOrder(d);
  const data = d.data() ?? {};
  const timelineRaw = Array.isArray(data.timeline) ? data.timeline : [];
  const acceptedAtMs = safeToMillis(data.acceptedAt);
  const pickedUpAtMs = safeToMillis(data.pickedUpAt);
  const deliveredAtMs = safeToMillis(data.deliveredAt);
  warnDevIfUnparsableTimestamp(d.id, 'acceptedAt', data.acceptedAt);
  warnDevIfUnparsableTimestamp(d.id, 'pickedUpAt', data.pickedUpAt);
  warnDevIfUnparsableTimestamp(d.id, 'deliveredAt', data.deliveredAt);
  return {
    ...base,
    assignedDriverId:
      typeof data.assignedDriverId === 'string'
        ? data.assignedDriverId
        : typeof data.driverId === 'string'
          ? data.driverId
          : null,
    acceptedAtMs,
    pickedUpAtMs,
    deliveredAtMs,
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
            updatedAt: safeToMillis((data.driverLocation as { updatedAt?: unknown }).updatedAt),
          } as DeliveryLocation)
        : null,
    timeline: (() => {
      const timeline: ActiveDelivery['timeline'] = [];
      for (const event of timelineRaw) {
        if (!event || typeof event !== 'object') continue;
        const row = event as Record<string, unknown>;
        timeline.push({
          type: typeof row.type === 'string' ? row.type : 'event',
          actor: typeof row.actor === 'string' ? row.actor : 'system',
          at: safeToMillis(row.at),
          note: typeof row.note === 'string' ? row.note : null,
        });
      }
      return timeline;
    })(),
    driverName: typeof data.driverName === 'string' ? data.driverName : null,
    driverPhone: typeof data.driverPhone === 'string' ? data.driverPhone : null,
  };
}

function safeMapQueueOrder(row: QueryDocumentSnapshot): DeliveryQueueOrder | null {
  try {
    return mapQueueOrder({
      id: row.id,
      data: () => (row.data() ?? {}) as Record<string, unknown>,
    });
  } catch (err) {
    warnMalformedDeliveryDoc(row.id, 'mapQueueOrder', err);
    return null;
  }
}

function safeMapActiveDelivery(row: DocumentSnapshot): ActiveDelivery | null {
  try {
    return mapActiveDelivery({
      id: row.id,
      data: () => (row.data() ?? {}) as Record<string, unknown>,
    });
  } catch (err) {
    warnMalformedDeliveryDoc(row.id, 'mapActiveDelivery', err);
    return null;
  }
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
  let unsubDriver: Unsubscribe | null = null;
  let unsubOrders: Unsubscribe | null = null;
  let cancelled = false;

  const emit = () => {
    if (!online) {
      onData([]);
      return;
    }
    const unique = Array.from(new Map(cache.map((row) => [row.id, row])).values());
    unique.sort((a, b) => {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      const ta = a.createdAtMs ?? 0;
      const tb = b.createdAtMs ?? 0;
      return tb - ta;
    });
    onData(unique);
  };

  const detachPoolListener = () => {
    unsubOrders?.();
    unsubOrders = null;
    cache = [];
  };

  const attachPoolListener = async () => {
    if (cancelled || unsubOrders) return;
    const authUid = auth.currentUser?.uid?.trim() ?? '';
    if (!authUid || authUid !== driverId.trim()) return;

    const poolFilters = { orderBy: 'createdAt desc', clientExpiryFilter: true };
    await logDriverQueryStart({
      listener: 'subscribeDriverQueue',
      collection: 'driver_marketplace_pool',
      filters: poolFilters,
    });

    try {
      unsubOrders = onSnapshot(
        query(collection(db, 'driver_marketplace_pool'), orderBy('createdAt', 'desc'), limit(30)),
        (snap) => {
          if (cancelled) return;
          try {
            cache = snap.docs
              .map((row) => safeMapQueueOrder(row))
              .filter((row): row is DeliveryQueueOrder => row != null)
              .filter((row) => {
                const raw = snap.docs.find((d) => d.id === row.id)?.data() ?? {};
                return !isDriverPoolRowStale(raw.createdAt, row.createdAtMs);
              });
          } catch (err) {
            warnMalformedDeliveryDoc('(batch)', 'subscribeDriverQueue pool map', err);
            cache = [];
          }
          emit();
        },
        (error) => {
          logDriverQueryError('subscribeDriverQueue.driver_marketplace_pool', error);
          if (isFirestorePermissionDenied(error)) {
            cache = [];
            emit();
            return;
          }
          safeListenerError('subscribeDriverQueue driver_marketplace_pool', () => {
            cache = [];
            emit();
          })(error);
        },
      );
    } catch (error) {
      logDriverQueryError('subscribeDriverQueue.driver_marketplace_pool.setup', error);
      cache = [];
      emit();
    }
  };

  runListenerBootstrap('subscribeDriverQueue', async () => {
    try {
      await ensureAuthRoleClaim('driver');
    } catch (err) {
      logDeliveryListenError('subscribeDriverQueue ensureAuthRoleClaim', err);
    }
    if (cancelled) return;

    try {
      await ensureDriverPresenceDoc(driverId);
    } catch (err) {
      logDeliveryListenError('subscribeDriverQueue ensureDriverPresenceDoc', err);
    }
    if (cancelled) return;

    const presenceFilters = { path: `drivers/${driverId}` };
    await logDriverQueryStart({
      listener: 'subscribeDriverQueue',
      collection: 'drivers',
      filters: presenceFilters,
    });

    try {
      unsubDriver = onSnapshot(
        driverPresenceDoc(driverId),
        (snap) => {
          try {
            const data = snap.data();
            const nextOnline = resolveDriverOnline(data);
            if (nextOnline !== online) {
              online = nextOnline;
              if (online) {
                void attachPoolListener();
              } else {
                detachPoolListener();
              }
            }
          } catch (err) {
            warnMalformedDeliveryDoc(driverId, 'subscribeDriverQueue driver doc', err);
            online = false;
            detachPoolListener();
          }
          emit();
        },
        (error) => {
          logDriverQueryError('subscribeDriverQueue.drivers', error);
          online = false;
          detachPoolListener();
          safeListenerError(`subscribeDriverQueue drivers/${driverId}`, () => emit())(error);
        },
      );
    } catch (error) {
      logDriverQueryError('subscribeDriverQueue.drivers.setup', error);
      online = false;
      emit();
    }
  }, () => {
    cache = [];
    onData([]);
  });

  return () => {
    cancelled = true;
    unsubDriver?.();
    detachPoolListener();
  };
}

export async function acceptOrderWithLock(orderId: string, driver: DriverIdentity): Promise<void> {
  const ref = doc(db, 'orders', orderId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('missing_order');
      const data = snap.data() ?? {};
      if (data.assignedDriverId || data.driverId) throw new Error('already_assigned');
      const status = normalizeDeliveryLifecycleStatus(data.deliveryStatus);
      if (status !== DELIVERY_STATUS.AVAILABLE) throw new Error('not_available');

      tracedTransactionUpdateOrder(
        tx,
        ref,
        {
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
        },
        { fileName: 'delivery/index.ts', functionName: 'acceptOrderWithLock' },
      );

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
  } catch (e) {
    if (isPermissionDeniedError(e) && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[delivery] acceptOrderWithLock permission denied', { orderId, error: e });
    }
    throw e;
  }
}

export async function declineOrder(orderId: string, driverId: string): Promise<void> {
  try {
    await setDoc(
      doc(db, 'orders', orderId, 'driverDeclines', driverId),
      { createdAt: serverTimestamp(), driverId },
      { merge: true },
    );
  } catch (e) {
    if (isPermissionDeniedError(e) && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[delivery] declineOrder permission denied', { orderId, driverId, error: e });
    }
    throw e;
  }
}

export function subscribeActiveDelivery(
  orderId: string,
  onData: (order: ActiveDelivery | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'orders', orderId),
    (snap) => {
      try {
        if (!snap.exists()) {
          onData(null);
          return;
        }
        const mapped = safeMapActiveDelivery(snap);
        onData(mapped);
      } catch (err) {
        warnMalformedDeliveryDoc(orderId, 'subscribeActiveDelivery snapshot', err);
        onData(null);
      }
    },
    (error) => {
      logDeliveryListenError(`subscribeActiveDelivery orders/${orderId}`, error);
      onData(null);
    },
  );
}

export function subscribeDriverActiveOrders(
  driverId: string,
  onData: (orders: ActiveDelivery[]) => void,
): Unsubscribe {
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  runListenerBootstrap('subscribeDriverActiveOrders', async () => {
    try {
      await ensureAuthRoleClaim('driver');
    } catch (err) {
      logDeliveryListenError('subscribeDriverActiveOrders ensureAuthRoleClaim', err);
    }
    if (cancelled) return;

    try {
      await ensureDriverPresenceDoc(driverId);
    } catch (err) {
      logDeliveryListenError('subscribeDriverActiveOrders ensureDriverPresenceDoc', err);
    }
    if (cancelled) return;

    const authUid = auth.currentUser?.uid?.trim() ?? '';
    if (!authUid || authUid !== driverId.trim()) {
      onData([]);
      return;
    }

    const activeFilters = {
      assignedDriverId: authUid,
      deliveryType: 'delivery',
      orderBy: 'createdAt desc',
    };
    await logDriverQueryStart({
      listener: 'subscribeDriverActiveOrders',
      collection: 'orders',
      filters: activeFilters,
    });

    try {
      unsub = onSnapshot(
        query(
          collection(db, 'orders'),
          where('assignedDriverId', '==', authUid),
          where('deliveryType', '==', 'delivery'),
          orderBy('createdAt', 'desc'),
        ),
        (snap) => {
          if (cancelled) return;
          try {
            const rows = snap.docs
              .map((d) => safeMapActiveDelivery(d))
              .filter((order): order is ActiveDelivery => order != null)
              .filter((order) => ACTIVE_DELIVERY_STATUSES.includes(order.deliveryStatus));
            rows.sort((a, b) => {
              const ca = a.createdAtMs ?? 0;
              const cb = b.createdAtMs ?? 0;
              if (ca !== cb) return cb - ca;
              return a.id.localeCompare(b.id);
            });
            onData(rows);
          } catch (err) {
            warnMalformedDeliveryDoc(driverId, 'subscribeDriverActiveOrders snapshot', err);
            onData([]);
          }
        },
        (error) => {
          logDriverQueryError('subscribeDriverActiveOrders', error);
          if (isFirestorePermissionDenied(error)) {
            onData([]);
            return;
          }
          safeListenerError('subscribeDriverActiveOrders', () => onData([]))(error);
        },
      );
    } catch (error) {
      logDriverQueryError('subscribeDriverActiveOrders.setup', error);
      onData([]);
    }
  }, () => onData([]));

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function updateDeliveryStatus(
  orderId: string,
  driverId: string,
  nextStatus: DeliveryLifecycleStatus,
): Promise<void> {
  const ref = doc(db, 'orders', orderId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('missing_order');
      const data = snap.data() ?? {};
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
      tracedTransactionUpdateOrder(tx, ref, patch, {
        fileName: 'delivery/index.ts',
        functionName: 'updateDeliveryStatus',
      });
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
  } catch (e) {
    if (isPermissionDeniedError(e) && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[delivery] updateDeliveryStatus permission denied', {
        orderId,
        driverId,
        nextStatus,
        error: e,
      });
    }
    throw e;
  }
}

export async function updateDriverLiveLocation(
  orderId: string,
  driverId: string,
  location: DeliveryLocation,
): Promise<void> {
  try {
    await syncDriverLiveLocation(orderId, driverId, {
      latitude: location.lat,
      longitude: location.lng,
      heading: location.heading ?? null,
      speed: location.speed ?? null,
    });
  } catch (e) {
    if (isPermissionDeniedError(e) && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[delivery] updateDriverLiveLocation permission denied', {
        orderId,
        driverId,
        error: e,
      });
    }
    throw e;
  }
}

export async function setDriverOnlineAvailability(
  driverId: string,
  online: boolean,
): Promise<void> {
  try {
    await setDoc(
      doc(db, 'drivers', driverId),
      {
        isOnline: online,
        online,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    if (isPermissionDeniedError(e) && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[delivery] setDriverOnlineAvailability permission denied', {
        driverId,
        error: e,
      });
    }
    throw e;
  }
}
