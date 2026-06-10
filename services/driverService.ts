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
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { ensureAuthRoleClaim } from '@/services/authRoleClaims';
import { isTerminalMarketplaceOrder } from '@/lib/orderTerminalStatus';
import {
  isDriverActiveListTerminal,
  logDuplicateQueryDocMatch,
  logQuerySource,
} from '@/lib/driverActiveOrderFilter';
import { driverCourierForwardRank } from '@/lib/driverCourierSnapshotMerge';
import {
  DRIVER_PRESENCE_COLLECTION,
  driverPresenceDoc,
  ensureDriverPresenceDoc,
  resolveDriverOnline,
  updateDriverOnlineStatus,
} from '@/services/driverPresence';
import { acceptOrderWithLock } from '@/services/delivery';
import { logStatusWrite, orderDocumentPath } from '@/lib/orderTerminalStatus';
import {
  prepareProtectedOrderPatch,
  protectedUpdateOrder,
} from '@/services/orderFirestoreWrite';
import { safeToMillis, warnDevIfUnparsableTimestamp } from '@/utils/safeToMillis';
import { runListenerBootstrap, safeListenerError } from '@/utils/safeFirestoreListener';
import {
  isFirestorePermissionDenied,
  logDriverQueryError,
  logDriverQueryStart,
} from './firestoreDriverQueryLog';
import { auth, db, syncAuthForFirestoreReads } from './firebase';
import { isMarketplaceOrderExpired } from '@/lib/marketplaceActiveOrder';
import { getHumanOrderAge } from '@/lib/orderExpiry';
import {
  isDriverActiveMarketplaceOrder,
  isDriverCompletedMarketplaceOrder,
  isDriverOrderTerminalForActiveList,
} from '@/lib/driverHubActiveOrders';
import { filterHubActiveDriverOrders } from '@/lib/driverHubOrdersStore';
import {
  subscribeDriverEarnings,
} from '@/services/driverEarnings';
import {
  isDriverMarketplaceClaimable,
  isPaidMarketplaceDeliveryOrder,
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import { marketplaceLog } from '@/lib/marketplaceLogger';
import { isDriverPoolRowStale } from '@/lib/marketplacePoolAge';
import type { OrderStatus } from './orderService';

async function prepareDriverFirestoreAccess(driverId: string): Promise<string | null> {
  const uid = driverId?.trim() ?? '';
  if (!uid) return null;
  await syncAuthForFirestoreReads();
  const authUid = auth.currentUser?.uid?.trim() ?? '';
  if (!authUid || authUid !== uid) return null;
  try {
    await ensureAuthRoleClaim('driver');
  } catch {
    /* list rules also allow hasDriverAccountDoc() */
  }
  try {
    await ensureDriverPresenceDoc(authUid);
  } catch {
    /* non-fatal; pool/list may still fail until doc exists */
  }
  return authUid;
}

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
  deliveryStatus: string;
  expired: boolean;
  placedLabel: string;
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
  deliveredAtMs: number | null;
  updatedAtMs: number | null;
  driverId: string | null;
  assignedDriverId: string | null;
  marketplaceArchived: boolean;
  earningsRecorded: boolean;
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

/** Keep aligned with `parseStatus` in orderService — never remap payment_confirmed. */
function normalizeStatus(value: unknown): OrderStatus {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s === 'pending_payment') return 'awaiting_payment';
  if (s === 'confirmed') return 'payment_confirmed';
  if (
    s === 'awaiting_payment' ||
    s === 'payment_processing' ||
    s === 'payment_confirmed' ||
    s === 'payment_failed' ||
    s === 'pending' ||
    s === 'pending_driver' ||
    s === 'driver_accepted' ||
    s === 'driver_assigned' ||
    s === 'arriving_restaurant' ||
    s === 'picked_up_pending' ||
    s === 'accepted' ||
    s === 'restaurant_accepted' ||
    s === 'preparing' ||
    s === 'ready' ||
    s === 'ready_for_pickup' ||
    s === 'picked_up' ||
    s === 'on_the_way' ||
    s === 'arrived_customer' ||
    s === 'delivered' ||
    s === 'completed' ||
    s === 'cancelled' ||
    s === 'rejected'
  ) {
    return s;
  }
  return 'pending';
}

function pickFreshestDriverOrder(a: DriverOrder, b: DriverOrder): DriverOrder {
  const rankA = driverCourierForwardRank(a.deliveryStatus);
  const rankB = driverCourierForwardRank(b.deliveryStatus);
  if (rankB > rankA) return b;
  if (rankA > rankB) return a;
  const msA = a.updatedAtMs ?? 0;
  const msB = b.updatedAtMs ?? 0;
  if (msA === 0 || msB === 0) return msB >= msA ? b : a;
  return msB >= msA ? b : a;
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
  warnDevIfUnparsableTimestamp(d.id, 'updatedAt', data.updatedAt);
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
    deliveredAtMs: safeToMillis(data.deliveredAt),
    updatedAtMs: safeToMillis(data.updatedAt),
    deliveryStatus: normalizeMarketplaceDeliveryStatus(data.deliveryStatus),
    expired: isMarketplaceOrderExpired({
      createdAt: data.createdAt,
      paidAt: data.paidAt,
      updatedAt: data.updatedAt,
      readyAt: data.readyAt,
      acceptedAt: data.acceptedAt,
      expired: data.expired,
      marketplaceArchived: data.marketplaceArchived,
    }),
    placedLabel: getHumanOrderAge(data.createdAt, {
      fallbackFields: {
        createdAt: data.createdAt,
        paidAt: data.paidAt,
        updatedAt: data.updatedAt,
        readyAt: data.readyAt,
        acceptedAt: data.acceptedAt,
      },
    }),
    estimatedDeliveryTime: (() => {
      const mins =
        typeof data.estimatedDeliveryMinutes === 'number'
          ? data.estimatedDeliveryMinutes
          : typeof data.estimatedDeliveryTime === 'number'
            ? data.estimatedDeliveryTime
            : 0;
      if (mins > 0 && mins < 180) return mins;
      return 35;
    })(),
    distanceKm: distanceKm(driverLocation ?? restaurantLocation, dropoffLocation),
    driverId: typeof data.driverId === 'string' ? data.driverId : null,
    assignedDriverId:
      typeof data.assignedDriverId === 'string' ? data.assignedDriverId : null,
    marketplaceArchived: data.marketplaceArchived === true,
    earningsRecorded: data.earningsRecorded === true,
  };
}

export {
  isDriverActiveMarketplaceOrder,
  isDriverCompletedMarketplaceOrder,
} from '@/lib/driverHubActiveOrders';

export function subscribeDrivers(
  onData: (drivers: DriverProfile[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'drivers'), where('isOnline', '==', true)),
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
  const noopUnsub = () => {};
  let unsubs: Unsubscribe[] = [];
  let cancelled = false;
  let byDriverId: DriverOrder[] = [];
  let byAssignedId: DriverOrder[] = [];
  const querySourcesByOrderId = new Map<string, Set<string>>();

  const trackQueryDoc = (
    docSnap: { id: string; data: () => Record<string, unknown> },
    snapshotQueryName: string,
    fromCache: boolean,
  ) => {
    const raw = docSnap.data();
    const sources = querySourcesByOrderId.get(docSnap.id) ?? new Set<string>();
    sources.add(snapshotQueryName);
    querySourcesByOrderId.set(docSnap.id, sources);
    logQuerySource(docSnap.id, raw.status, raw.deliveryStatus, snapshotQueryName, {
      firestorePath: `orders/${docSnap.id}`,
      driverId: raw.driverId,
      assignedDriverId: raw.assignedDriverId,
      fromCache,
    });
    logDuplicateQueryDocMatch(docSnap.id, Array.from(sources), raw);
  };

  const emitMerged = () => {
    if (cancelled) return;
    try {
      const merged = new Map<string, DriverOrder>();
      for (const row of [...byDriverId, ...byAssignedId]) {
        const prev = merged.get(row.id);
        merged.set(row.id, prev ? pickFreshestDriverOrder(prev, row) : row);
      }
      const rows = Array.from(merged.values())
        .filter((row) => {
          const terminal =
            isTerminalMarketplaceOrder(row) || isDriverActiveListTerminal(row);
          if (terminal) {
            logQuerySource(
              row.id,
              row.status,
              row.deliveryStatus,
              'subscribeToDriverOrders.merged',
              {
                firestorePath: `orders/${row.id}`,
                driverId: row.driverId,
                assignedDriverId: row.assignedDriverId,
                entersActiveList: false,
              },
            );
          }
          return !terminal;
        })
        .sort(
        (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0),
      );
      for (const row of rows) {
        const sources = Array.from(querySourcesByOrderId.get(row.id) ?? ['subscribeToDriverOrders.merged']);
        const queryLabel = sources.length > 1 ? sources.join('+') : sources[0] ?? 'subscribeToDriverOrders.merged';
        logQuerySource(row.id, row.status, row.deliveryStatus, queryLabel, {
          firestorePath: `orders/${row.id}`,
          driverId: row.driverId,
          assignedDriverId: row.assignedDriverId,
          entersActiveList: true,
          duplicateQueryMatch: sources.length > 1,
        });
      }
      onData(rows);
    } catch {
      onData([]);
    }
  };

  runListenerBootstrap('subscribeToDriverOrders', async () => {
    const authUid = await prepareDriverFirestoreAccess(driverId);
    if (cancelled || !authUid) {
      onData([]);
      return;
    }

    const driverIdFilters = {
      driverId: authUid,
      deliveryType: 'delivery',
      orderBy: 'createdAt desc',
    };
    await logDriverQueryStart({
      listener: 'subscribeToDriverOrders',
      collection: 'orders',
      filters: driverIdFilters,
    });

    try {
      const unsubDriverId = onSnapshot(
        query(
          collection(db, 'orders'),
          where('driverId', '==', authUid),
          where('deliveryType', '==', 'delivery'),
          orderBy('createdAt', 'desc'),
        ),
        (snap) => {
          if (cancelled) return;
          try {
            for (const docSnap of snap.docs) {
              trackQueryDoc(docSnap, 'subscribeToDriverOrders.driverId', snap.metadata.fromCache);
            }
            byDriverId = snap.docs.map((docSnap) => mapDriverOrder(docSnap));
            emitMerged();
          } catch (err) {
            logDriverQueryError('subscribeToDriverOrders.driverId', err);
            byDriverId = [];
            emitMerged();
          }
        },
        (error) => {
          logDriverQueryError('subscribeToDriverOrders.driverId', error);
          if (isFirestorePermissionDenied(error)) {
            byDriverId = [];
            emitMerged();
            return;
          }
          safeListenerError('subscribeToDriverOrders.driverId', () => {
            byDriverId = [];
            emitMerged();
          })(error);
        },
      );
      unsubs.push(unsubDriverId);
    } catch (error) {
      logDriverQueryError('subscribeToDriverOrders.driverId.setup', error);
    }

    const assignedFilters = {
      assignedDriverId: authUid,
      deliveryType: 'delivery',
      orderBy: 'createdAt desc',
    };
    await logDriverQueryStart({
      listener: 'subscribeToDriverOrders.assignedDriverId',
      collection: 'orders',
      filters: assignedFilters,
    });

    try {
      const unsubAssigned = onSnapshot(
        query(
          collection(db, 'orders'),
          where('assignedDriverId', '==', authUid),
          where('deliveryType', '==', 'delivery'),
          orderBy('createdAt', 'desc'),
        ),
        (snap) => {
          if (cancelled) return;
          try {
            for (const docSnap of snap.docs) {
              trackQueryDoc(
                docSnap,
                'subscribeToDriverOrders.assignedDriverId',
                snap.metadata.fromCache,
              );
            }
            byAssignedId = snap.docs.map((docSnap) => mapDriverOrder(docSnap));
            emitMerged();
          } catch (err) {
            logDriverQueryError('subscribeToDriverOrders.assignedDriverId', err);
            byAssignedId = [];
            emitMerged();
          }
        },
        (error) => {
          logDriverQueryError('subscribeToDriverOrders.assignedDriverId', error);
          if (isFirestorePermissionDenied(error)) {
            byAssignedId = [];
            emitMerged();
            return;
          }
          safeListenerError('subscribeToDriverOrders.assignedDriverId', () => {
            byAssignedId = [];
            emitMerged();
          })(error);
        },
      );
      unsubs.push(unsubAssigned);
    } catch (error) {
      logDriverQueryError('subscribeToDriverOrders.assignedDriverId.setup', error);
    }
  }, () => onData([]));

  return () => {
    cancelled = true;
    for (const unsub of unsubs) unsub();
    unsubs = [];
  };
}

export type DriverDeliveryBreakdownItem = {
  orderId: string;
  earning: number;
  deliveredAtMs: number | null;
};

export type DriverDeliveryStats = {
  deliveries: number;
  earnings: number;
  earningsToday: number;
  earningsWeek: number;
  deliveriesToday: number;
  deliveriesWeek: number;
  averageEarning: number;
  platformFees: number;
  rating: number;
  breakdown: DriverDeliveryBreakdownItem[];
};

const EMPTY_DRIVER_STATS: DriverDeliveryStats = {
  deliveries: 0,
  earnings: 0,
  earningsToday: 0,
  earningsWeek: 0,
  deliveriesToday: 0,
  deliveriesWeek: 0,
  averageEarning: 0,
  platformFees: 0,
  rating: 5.0,
  breakdown: [],
};

/** Completed deliveries + earnings for driver dashboard stats. */
export function subscribeDriverDeliveryStats(
  driverId: string,
  onStats: (stats: DriverDeliveryStats) => void,
): Unsubscribe {
  const noopUnsub = () => {};
  let innerUnsub: Unsubscribe | null = null;
  let cancelled = false;

  const emitEmpty = () => onStats(EMPTY_DRIVER_STATS);

  try {
    runListenerBootstrap('subscribeDriverDeliveryStats', async () => {
      const authUid = await prepareDriverFirestoreAccess(driverId);
      if (cancelled || !authUid) {
        emitEmpty();
        return;
      }

      await logDriverQueryStart({
        listener: 'subscribeDriverDeliveryStats',
        collection: 'orders',
        filters: {
          driverId: authUid,
          assignedDriverId: authUid,
          status: ['delivered', 'completed'],
        },
      });

      if (cancelled) {
        emitEmpty();
        return;
      }

      innerUnsub = subscribeDriverEarnings(authUid, (next) => {
        if (cancelled) return;
        onStats({
          ...next,
          rating: 5.0,
        });
      });
    }, emitEmpty);
  } catch (error) {
    if (isFirestorePermissionDenied(error)) {
      // eslint-disable-next-line no-console
      console.warn('[driver] subscribeDriverDeliveryStats permission denied', error);
      emitEmpty();
      return noopUnsub;
    }
    logDriverQueryError('subscribeDriverDeliveryStats.bootstrap', error);
    emitEmpty();
    return noopUnsub;
  }

  return () => {
    cancelled = true;
    innerUnsub?.();
  };
}

/**
 * Paid delivery queue: awaiting driver (`pending_driver`), unassigned, delivery only.
 */
export function subscribeAvailableOrders(
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  runListenerBootstrap('subscribeAvailableOrders', async () => {
    const authUid = auth.currentUser?.uid?.trim() ?? '';
    if (cancelled || !authUid) {
      onData([]);
      return;
    }
    await prepareDriverFirestoreAccess(authUid);
    if (cancelled) return;

    const poolFilters = { orderBy: 'createdAt desc', limit: 20, clientExpiryFilter: true };
    await logDriverQueryStart({
      listener: 'subscribeAvailableOrders',
      collection: 'driver_marketplace_pool',
      filters: poolFilters,
    });

    if (cancelled) return;

    try {
      unsub = onSnapshot(
        query(collection(db, 'driver_marketplace_pool'), orderBy('createdAt', 'desc'), limit(20)),
        (snap) => {
          if (cancelled) return;
          try {
            const rows = snap.docs
              .map((docSnap) => mapDriverOrder(docSnap))
              .filter((order) => {
                const raw = snap.docs.find((d) => d.id === order.id)?.data() ?? {};
                if (isTerminalMarketplaceOrder({ id: order.id, ...raw })) return false;
                return !isDriverPoolRowStale(raw.createdAt, order.createdAtMs);
              });
            marketplaceLog.listenerUpdate(rows.length, {
              listener: 'subscribeAvailableOrders',
              rawCount: snap.size,
            });
            onData(rows);
          } catch (err) {
            logDriverQueryError('subscribeAvailableOrders', err);
            onData([]);
          }
        },
        (error) => {
          logDriverQueryError('subscribeAvailableOrders', error);
          if (isFirestorePermissionDenied(error)) {
            onData([]);
            return;
          }
          safeListenerError('subscribeAvailableOrders driver_marketplace_pool', () => onData([]))(
            error,
          );
        },
      );
    } catch (error) {
      logDriverQueryError('subscribeAvailableOrders.setup', error);
      onData([]);
    }
  }, () => onData([]));

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function assignDriverToOrder(
  orderId: string,
  driver: DriverProfile,
  _currentStatus: OrderStatus | string,
): Promise<void> {
  await protectedUpdateOrder(
    orderId,
    {
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone ?? null,
      status: 'driver_accepted',
      acceptedAt: serverTimestamp(),
    },
    { fileName: 'driverService.ts', functionName: 'assignDriverToOrder' },
  );
}

/** Driver claims a ready order (still at restaurant until pickup). */
export async function acceptDeliveryOrder(
  orderId: string,
  driver: DriverProfile,
  vehicle?: string | null,
): Promise<void> {
  await protectedUpdateOrder(
    orderId,
    {
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone ?? null,
      ...(vehicle ? { driverVehicle: vehicle } : {}),
      status: 'driver_accepted',
      acceptedAt: serverTimestamp(),
      estimatedDeliveryTime: 18,
    },
    { fileName: 'driverService.ts', functionName: 'acceptDeliveryOrder' },
  );
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
      protectedUpdateOrder(
        orderDoc.id,
        {
          driverId: driver.id,
          driverName: driver.name,
          driverPhone: driver.phone ?? null,
          status: 'driver_accepted',
          acceptedAt: serverTimestamp(),
          estimatedDeliveryTime: 18,
        },
        { fileName: 'driverService.ts', functionName: 'acceptGroupDelivery' },
      ),
    ),
  );
}

export async function driverMarkPickedUp(orderId: string): Promise<void> {
  const { applyDriverMarketplaceFulfillment } = await import(
    '@/lib/driverMarketplaceFulfillment'
  );
  const result = await applyDriverMarketplaceFulfillment(orderId, 'pickup');
  if (result === 'skipped_illegal') {
    throw new Error('Order is not ready for pickup');
  }
}

export async function driverMarkOnTheWay(orderId: string): Promise<void> {
  await protectedUpdateOrder(
    orderId,
    {
      deliveryStatus: 'on_the_way',
      estimatedDeliveryTime: 10,
    },
    { fileName: 'driverService.ts', functionName: 'driverMarkOnTheWay' },
  );
}

export async function driverMarkArrivedCustomer(orderId: string): Promise<void> {
  await protectedUpdateOrder(
    orderId,
    {
      deliveryStatus: 'near_customer',
      estimatedDeliveryTime: 4,
    },
    { fileName: 'driverService.ts', functionName: 'driverMarkArrivedCustomer' },
  );
}

export async function driverMarkDelivered(orderId: string): Promise<void> {
  const { applyDriverMarketplaceFulfillment } = await import(
    '@/lib/driverMarketplaceFulfillment'
  );
  const result = await applyDriverMarketplaceFulfillment(orderId, 'deliver');
  if (result === 'skipped_illegal') {
    throw new Error('Order must be picked up before delivery');
  }
}

export async function driverMarkHeadingToRestaurant(orderId: string): Promise<void> {
  await protectedUpdateOrder(
    orderId,
    {
      deliveryStatus: 'heading_to_restaurant',
    },
    { fileName: 'driverService.ts', functionName: 'driverMarkHeadingToRestaurant' },
  );
}

export async function markPickedUp(orderId: string): Promise<void> {
  await driverMarkPickedUp(orderId);
}

/**
 * Driver claims a paid matching-queue order (`pending_driver`) or a restaurant-released dispatch order (`ready_for_pickup` + `waiting_driver`).
 * Updates embedded `driver` snapshot for customer/restaurant UIs.
 */
const CLAIM_BLOCK_STATUSES = new Set([
  'completed',
  'delivered',
  'picked_up',
  'ready_for_pickup',
  'driver_assigned',
]);

function normOrderStatusField(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function claimMarketplaceDriverOrder(
  orderId: string,
  driver: DriverProfile,
  vehicle?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const orderRef = doc(db, 'orders', orderId);
  const ruleSafePayload = {
    driverId: driver.id,
    assignedDriverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone ?? null,
    ...(vehicle ? { driverVehicle: vehicle } : {}),
    deliveryStatus: 'driver_assigned',
    status: 'driver_assigned',
  };

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) {
        marketplaceLog.acceptFailed(orderId, { reason: 'missing' });
        return { ok: false, reason: 'missing' };
      }
      const data = snap.data();
      const currentStatus = normOrderStatusField(data.status);
      const currentDeliveryStatus = normOrderStatusField(data.deliveryStatus);
      if (
        CLAIM_BLOCK_STATUSES.has(currentStatus) ||
        CLAIM_BLOCK_STATUSES.has(currentDeliveryStatus)
      ) {
        console.warn('[claimMarketplaceDriverOrder] BLOCKED - order already advanced/terminal', {
          orderId,
          currentStatus: data.status ?? null,
          currentDeliveryStatus: data.deliveryStatus ?? null,
        });
        marketplaceLog.acceptFailed(orderId, {
          reason: 'order_already_advanced',
          currentStatus: data.status ?? null,
          currentDeliveryStatus: data.deliveryStatus ?? null,
        });
        return { ok: false, reason: 'order_already_advanced' };
      }
      if (typeof data.driverId === 'string' && data.driverId.length > 0) {
        marketplaceLog.acceptFailed(orderId, {
          reason: 'already_assigned',
          assignedDriverId: data.driverId,
          conflictingAssignment: data.driverId !== driver.id,
        });
        return { ok: false, reason: 'already_assigned' };
      }
      if (
        typeof data.assignedDriverId === 'string' &&
        data.assignedDriverId.length > 0
      ) {
        marketplaceLog.acceptFailed(orderId, {
          reason: 'already_assigned',
          assignedDriverId: data.assignedDriverId,
          conflictingAssignment: data.assignedDriverId !== driver.id,
        });
        return { ok: false, reason: 'already_assigned' };
      }

      const existingPin =
        typeof data.deliveryPin === 'string' && /^\d{4}$/.test(data.deliveryPin)
          ? data.deliveryPin
          : null;
      const deliveryPin = existingPin ?? String(1000 + Math.floor(Math.random() * 9000));

      const normalizedDelivery = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);
      const paid = isPaidMarketplaceDeliveryOrder(data);

      const driverBlob = {
        id: driver.id,
        name: driver.name,
        phone: driver.phone ?? null,
        vehicle: vehicle ?? null,
        avatar: null as string | null,
      };

      marketplaceLog.acceptStart(orderId, {
        paid,
        deliveryStatus: data.deliveryStatus,
        normalizedDelivery,
        ruleSafePayload,
      });

      if (paid && isDriverMarketplaceClaimable(normalizedDelivery)) {
        const requested = {
          ...ruleSafePayload,
          driver: driverBlob,
          acceptedAt: serverTimestamp(),
          estimatedDeliveryTime:
            typeof data.estimatedDeliveryTime === 'number' && data.estimatedDeliveryTime < 180
              ? data.estimatedDeliveryTime
              : 18,
          estimatedDeliveryMinutes:
            typeof data.estimatedDeliveryMinutes === 'number' &&
            data.estimatedDeliveryMinutes < 180
              ? data.estimatedDeliveryMinutes
              : 18,
          deliveryPin,
        };
        const safePatch = prepareProtectedOrderPatch(
          orderId,
          { id: orderId, ...(data as Record<string, unknown>) },
          requested,
          { fileName: 'driverService.ts', functionName: 'claimMarketplaceDriverOrder' },
        );
        if (Object.keys(safePatch).length > 0) {
          if (safePatch.deliveryStatus !== undefined || safePatch.status !== undefined) {
            logStatusWrite(orderId, data.status ?? null, safePatch.status ?? data.status ?? null, {
              source: 'driverService.ts#claimMarketplaceDriverOrder',
              firestorePath: orderDocumentPath(orderId),
              previousDeliveryStatus: data.deliveryStatus ?? null,
              newDeliveryStatus: safePatch.deliveryStatus ?? data.deliveryStatus ?? null,
            });
          }
          tx.update(orderRef, safePatch);
        }
        marketplaceLog.acceptSuccess(orderId, { normalizedDelivery, ruleSafePayload });
        return { ok: true };
      }

      marketplaceLog.acceptFailed(orderId, {
        paid,
        normalizedDelivery,
        reason: 'invalid_state',
        ruleSafePayload,
      });
      return { ok: false, reason: 'invalid_state' };
    });
  } catch (error) {
    marketplaceLog.acceptError(orderId, error, {
      ruleSafePayload,
      permissionDenied:
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'permission-denied',
    });
    return { ok: false, reason: 'permission_denied' };
  }
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
  return claimMarketplaceDriverOrder(orderId, driver);
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
  await protectedUpdateOrder(orderId, updates, {
    fileName: 'driverService.ts',
    functionName: 'updateOrderStatus',
  });
}

export async function acceptOrder(orderId: string, driverId: string): Promise<void> {
  await protectedUpdateOrder(
    orderId,
    {
      status: 'driver_accepted',
      driverId,
      driverAcceptedAt: serverTimestamp(),
    },
    { fileName: 'driverService.ts', functionName: 'acceptOrder' },
  );
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
  const uid = driverId.trim();
  return subscribeToDriverOrders(uid, (rows) => {
    onData(filterHubActiveDriverOrders(rows, uid));
  });
}

/** Recent completed marketplace deliveries for Driver Hub history. */
export function getDriverCompletedDeliveries(
  driverId: string,
  onData: (orders: DriverOrder[]) => void,
): Unsubscribe {
  const uid = driverId.trim();
  return subscribeToDriverOrders(uid, (rows) => {
    const completed = rows
      .filter((o) => isDriverCompletedMarketplaceOrder(o, uid))
      .sort((a, b) => (b.deliveredAtMs ?? b.createdAtMs ?? 0) - (a.deliveredAtMs ?? a.createdAtMs ?? 0));
    onData(completed);
  });
}

// Backward compatible alias
export const subscribeDriverOrders = subscribeToDriverOrders;

export { updateDriverOnlineStatus, driverPresenceDoc, resolveDriverOnline, DRIVER_PRESENCE_COLLECTION };
