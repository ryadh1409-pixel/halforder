import { ensureAuthRoleClaim } from '@/services/authRoleClaims';
import {
  driverPresenceDoc,
  ensureDriverPresenceDoc,
  resolveDriverOnline,
} from '@/services/driverPresence';
import { safeToMillis, warnDevIfUnparsableTimestamp } from '@/utils/safeToMillis';
import { runListenerBootstrap, safeListenerError } from '@/utils/safeFirestoreListener';
import { db } from './firebase';
import {
  isDriverMarketplaceClaimable,
  normalizeMarketplaceDeliveryStatus,
  type MarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import { marketplaceLog } from '@/lib/marketplaceLogger';
import { tracedTransactionUpdateOrder } from '@/services/orderFirestoreWrite';
import { isDriverPoolRowStale } from '@/lib/marketplacePoolAge';
import {
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
  deliveryStatus: MarketplaceDeliveryStatus;
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

export {
  DRIVER_PRESENCE_COLLECTION,
  driverPresenceDoc,
  resolveDriverOnline,
  updateDriverOnlineStatus,
} from '@/services/driverPresence';
// re-export for legacy imports from ./driverDispatch

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
    deliveryStatus: normalizeMarketplaceDeliveryStatus(data.deliveryStatus),
    driverId: typeof data.driverId === 'string' ? data.driverId : null,
    acceptedAtMs: safeToMillis(data.acceptedAt),
  };
}

export function subscribeAvailableOrders(
  driverId: string,
  onData: (orders: DispatchOrder[]) => void,
): Unsubscribe {
  let driverOnline = false;
  let ordersCache: DispatchOrder[] = [];
  let unsubDriver: Unsubscribe | null = null;
  let unsubOrders: Unsubscribe | null = null;
  let cancelled = false;
  const emit = () => {
    if (!driverOnline) {
      onData([]);
      return;
    }
    const available = ordersCache.filter((order) => !order.driverId);
    onData(available);
  };

  runListenerBootstrap('driverDispatch.subscribeAvailableOrders', async () => {
    try {
      await ensureAuthRoleClaim('driver');
    } catch {
      /* pool collection uses drivers/{uid} membership */
    }
    if (cancelled) return;

    try {
      await ensureDriverPresenceDoc(driverId);
    } catch {
      /* pool read requires exists(drivers/{auth.uid}) */
    }
    if (cancelled) return;

    unsubDriver = onSnapshot(
      driverPresenceDoc(driverId),
      (snap) => {
        const data = snap.data();
        driverOnline = resolveDriverOnline(data);
        emit();
      },
      safeListenerError('driverDispatch driver presence', () => {
        driverOnline = false;
        emit();
      }),
    );

    unsubOrders = onSnapshot(
      query(collection(db, 'driver_marketplace_pool'), orderBy('createdAt', 'desc'), limit(20)),
      (snap) => {
        ordersCache = snap.docs
          .map((orderDoc) => mapDispatchOrder(orderDoc))
          .filter((order) => {
            const raw = snap.docs.find((d) => d.id === order.id)?.data() ?? {};
            return !isDriverPoolRowStale(raw.createdAt, order.createdAtMs);
          });
        marketplaceLog.listenerUpdate(ordersCache.length, {
          listener: 'driverDispatch.pool',
          rawCount: snap.size,
        });
        emit();
      },
      safeListenerError('driverDispatch driver_marketplace_pool', () => {
        ordersCache = [];
        emit();
      }),
    );
  }, () => {
    ordersCache = [];
    emit();
  });

  return () => {
    cancelled = true;
    unsubDriver?.();
    unsubOrders?.();
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
    if (!isDriverMarketplaceClaimable(data.deliveryStatus)) {
      marketplaceLog.acceptFailed(orderId, {
        deliveryStatus: data.deliveryStatus,
        normalized: normalizeMarketplaceDeliveryStatus(data.deliveryStatus),
      });
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

    tracedTransactionUpdateOrder(
      tx,
      orderRef,
      {
        driverId: driver.id,
        assignedDriverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone ?? null,
        acceptedAt: serverTimestamp(),
        deliveryStatus: 'driver_assigned',
        updatedAt: serverTimestamp(),
        estimatedDeliveryMinutes:
          typeof data.estimatedDeliveryMinutes === 'number' ? data.estimatedDeliveryMinutes : 20,
      },
      { fileName: 'driverDispatch.ts', functionName: 'acceptDelivery' },
      data,
    );
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
    tracedTransactionUpdateOrder(
      tx,
      orderRef,
      {
        driverId: null,
        assignedDriverId: null,
        driverName: null,
        driverPhone: null,
        acceptedAt: null,
        deliveryStatus: 'waiting_driver',
        status: 'ready_for_pickup',
      },
      { fileName: 'driverDispatch.ts', functionName: 'rejectDelivery' },
      data,
    );
  });
}
