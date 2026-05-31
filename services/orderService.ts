import { filterFreshRestaurantOrders } from '@/lib/restaurantOrderFreshness';
import { parseLegacyLatLng } from '@/lib/location/coordinates';
import { fetchRestaurantLocation, restaurantLocationToLegacy } from '@/services/location/restaurantLocation';
import type { CustomerLocationRecord } from '@/types/location';
import { formatOrderTime } from '@/utils/time';
import { safeToMillis, warnDevIfUnparsableTimestamp } from '@/utils/safeToMillis';
import { auth, db, ensureAuthReady } from './firebase';
import { normalizeDeliveryStatus, type DeliveryStatus } from './deliveryStatus';
import type {
  CustomerSnapshot,
  DriverSnapshot,
  RestaurantSnapshot,
} from '@/types/order';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

const RESTAURANT_ORDERS_LIST_LIMIT = 120;

/** Full delivery lifecycle (plus rejected / ready for handoff). */
export type OrderStatus =
  | 'awaiting_payment'
  | 'payment_processing'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'pending'
  | 'pending_driver'
  | 'driver_accepted'
  | 'driver_assigned'
  | 'arriving_restaurant'
  | 'picked_up_pending'
  | 'accepted'
  | 'restaurant_accepted'
  | 'preparing'
  | 'ready'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'on_the_way'
  | 'arrived_customer'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export type PaymentStatus = 'unpaid' | 'processing' | 'paid' | 'failed' | 'refunded';

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
};

export type LatLng = { lat: number; lng: number; heading?: number | null };

export type RestaurantOrder = {
  id: string;
  userId: string;
  customerName: string | null;
  customerPhone: string | null;
  restaurantId: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  totalPrice: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  stripePaymentIntentId: string | null;
  /** Canonical Stripe PI id (mirrors `stripePaymentIntentId` when set). */
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverVehicle: string | null;
  groupId: string | null;
  estimatedDeliveryTime: number;
  deliveryLocation: { lat: number; lng: number; address: string } | null;
  customerLocation: LatLng | null;
  userLocation: LatLng | null;
  restaurantLocation: LatLng | null;
  driverLocation: LatLng | null;
  notes: string | null;
  createdAtLabel: string;
  /** Firestore `createdAt` millis when available (for “today” stats). */
  createdAtMs: number | null;
  /** Soft-archive: removed from default restaurant dashboard list. */
  archivedByRestaurant: boolean;
  hiddenForRestaurant: boolean;
  archivedAtMs: number | null;
  hiddenAtMs: number | null;
  restoredAtMs: number | null;
  restaurant: RestaurantSnapshot;
  customer: CustomerSnapshot;
  driver: DriverSnapshot | null;
  acceptedAtMs: number | null;
  pickedUpAtMs: number | null;
  deliveredAtMs: number | null;
  cancelledAtMs: number | null;
  /** 4-digit handoff PIN — shown to customer, entered by driver to complete. */
  deliveryPin: string | null;
  /** Encoded polyline for map route (optional; from Directions API). */
  routePolyline: string | null;
};

function makeGroupId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseStatus(value: unknown): OrderStatus {
  const s = typeof value === 'string' ? value : '';
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
    s === 'cancelled' ||
    s === 'rejected'
  ) {
    return s;
  }
  return 'pending';
}

function parsePaymentStatus(value: unknown, orderStatus: OrderStatus): PaymentStatus {
  const p = typeof value === 'string' ? value : '';
  if (
    p === 'paid' ||
    p === 'unpaid' ||
    p === 'processing' ||
    p === 'failed' ||
    p === 'refunded'
  ) {
    return p;
  }
  if (orderStatus === 'payment_processing') return 'processing';
  if (orderStatus === 'awaiting_payment') return 'unpaid';
  if (orderStatus === 'payment_confirmed') return 'paid';
  return 'paid';
}

function parseLatLng(value: unknown): LatLng | null {
  return parseLegacyLatLng(value);
}

function toCreatedAtLabel(value: unknown, timeZone?: string): string {
  return formatOrderTime(value, { timeZone });
}

function mapDocToRestaurantOrder(
  d: { id: string; data: () => Record<string, unknown> },
  fallbackRestaurantId?: string,
  options?: { timeZone?: string },
): RestaurantOrder {
  const data = d.data();
  warnDevIfUnparsableTimestamp(d.id, 'createdAt', data.createdAt);
  warnDevIfUnparsableTimestamp(d.id, 'acceptedAt', data.acceptedAt);
  warnDevIfUnparsableTimestamp(d.id, 'pickedUpAt', data.pickedUpAt);
  warnDevIfUnparsableTimestamp(d.id, 'deliveredAt', data.deliveredAt);
  warnDevIfUnparsableTimestamp(d.id, 'cancelledAt', data.cancelledAt);
  const items = Array.isArray(data.items)
    ? data.items.map((item) => ({
        id:
          item && typeof item === 'object' && 'id' in item
            ? String((item as { id: unknown }).id)
            : '',
        name:
          item && typeof item === 'object' && 'name' in item
            ? String((item as { name: unknown }).name)
            : '',
        price:
          item && typeof item === 'object' && 'price' in item
            ? Number((item as { price: unknown }).price)
            : 0,
        qty:
          item && typeof item === 'object' && 'qty' in item
            ? Number((item as { qty: unknown }).qty)
            : 1,
        image:
          item && typeof item === 'object' && 'image' in item
            ? typeof (item as { image: unknown }).image === 'string'
              ? String((item as { image: unknown }).image)
              : null
            : null,
      }))
    : [];
  const rid =
    typeof data.restaurantId === 'string'
      ? data.restaurantId
      : typeof data.venueId === 'string'
        ? data.venueId
      : fallbackRestaurantId ?? '';
  const restaurantObj =
    data.restaurant && typeof data.restaurant === 'object'
      ? (data.restaurant as Record<string, unknown>)
      : null;
  const delivery = data.deliveryLocation;
  const customerLoc =
    parseLatLng(data.customerLocation) ?? parseLatLng(data.userLocation) ?? parseLatLng(delivery);
  const userLoc = customerLoc;
  const restLoc =
    parseLatLng(data.restaurantLocation) ??
    (restaurantObj &&
    typeof restaurantObj.latitude === 'number' &&
    typeof restaurantObj.longitude === 'number'
      ? { lat: restaurantObj.latitude, lng: restaurantObj.longitude }
      : null);

  const status = parseStatus(data.status);
  const customerObj =
    data.customer && typeof data.customer === 'object'
      ? (data.customer as Record<string, unknown>)
      : null;
  const driverObj =
    data.driver && typeof data.driver === 'object'
      ? (data.driver as Record<string, unknown>)
      : null;

  return {
    id: d.id,
    userId:
      typeof data.userId === 'string'
        ? data.userId
        : typeof data.customerId === 'string'
          ? data.customerId
          : '',
    customerName: typeof data.customerName === 'string' ? data.customerName : null,
    customerPhone:
      typeof data.customerPhone === 'string'
        ? data.customerPhone
        : typeof data.customerPhoneNumber === 'string'
          ? data.customerPhoneNumber
          : null,
    restaurantId: rid,
    items,
    subtotal:
      typeof data.subtotal === 'number'
        ? data.subtotal
        : typeof data.totalPrice === 'number'
          ? data.totalPrice
          : typeof data.total === 'number'
            ? data.total
            : 0,
    tax: typeof data.tax === 'number' ? data.tax : 0,
    deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
    totalPrice:
      typeof data.totalPrice === 'number'
        ? data.totalPrice
        : typeof data.total === 'number'
          ? data.total
          : 0,
    status,
    paymentStatus: parsePaymentStatus(data.paymentStatus, status),
    deliveryStatus: normalizeDeliveryStatus(data.deliveryStatus),
    stripePaymentIntentId:
      typeof data.stripePaymentIntentId === 'string'
        ? data.stripePaymentIntentId
        : typeof data.paymentIntentId === 'string'
          ? data.paymentIntentId
          : null,
    paymentIntentId:
      typeof data.paymentIntentId === 'string'
        ? data.paymentIntentId
        : typeof data.stripePaymentIntentId === 'string'
          ? data.stripePaymentIntentId
          : null,
    checkoutSessionId:
      typeof data.checkoutSessionId === 'string' ? data.checkoutSessionId : null,
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    estimatedDeliveryTime:
      typeof data.estimatedDeliveryTime === 'number' ? data.estimatedDeliveryTime : 35,
    driverId: typeof data.driverId === 'string' ? data.driverId : null,
    driverName: typeof data.driverName === 'string' ? data.driverName : null,
    driverPhone: typeof data.driverPhone === 'string' ? data.driverPhone : null,
    driverVehicle: typeof data.driverVehicle === 'string' ? data.driverVehicle : null,
    deliveryLocation:
      delivery &&
      typeof delivery === 'object' &&
      typeof (delivery as { lat?: unknown }).lat === 'number' &&
      typeof (delivery as { lng?: unknown }).lng === 'number' &&
      typeof (delivery as { address?: unknown }).address === 'string'
        ? {
            lat: (delivery as { lat: number }).lat,
            lng: (delivery as { lng: number }).lng,
            address: (delivery as { address: string }).address,
          }
        : null,
    customerLocation: customerLoc,
    userLocation: userLoc,
    restaurantLocation: restLoc,
    driverLocation: parseLatLng(data.driverLocation),
    notes: typeof data.notes === 'string' ? data.notes : null,
    createdAtLabel: toCreatedAtLabel(data.createdAt, options?.timeZone),
    createdAtMs: safeToMillis(data.createdAt),
    archivedByRestaurant: data.archivedByRestaurant === true,
    hiddenForRestaurant: data.hiddenForRestaurant === true,
    archivedAtMs: safeToMillis(data.archivedAt),
    hiddenAtMs: safeToMillis(data.hiddenAt),
    restoredAtMs: safeToMillis(data.restoredAt),
    restaurant: {
      id:
        restaurantObj && typeof restaurantObj.id === 'string'
          ? restaurantObj.id
          : rid,
      name:
        restaurantObj && typeof restaurantObj.name === 'string'
          ? restaurantObj.name
          : '',
      image:
        restaurantObj && typeof restaurantObj.image === 'string'
          ? restaurantObj.image
          : null,
      address:
        restaurantObj && typeof restaurantObj.address === 'string'
          ? restaurantObj.address
          : null,
      latitude:
        restaurantObj && typeof restaurantObj.latitude === 'number'
          ? restaurantObj.latitude
          : restLoc?.lat ?? null,
      longitude:
        restaurantObj && typeof restaurantObj.longitude === 'number'
          ? restaurantObj.longitude
          : restLoc?.lng ?? null,
    },
    customer: {
      id:
        customerObj && typeof customerObj.id === 'string'
          ? customerObj.id
          : typeof data.userId === 'string'
            ? data.userId
            : typeof data.customerId === 'string'
              ? data.customerId
              : '',
      name:
        customerObj && typeof customerObj.name === 'string'
          ? customerObj.name
          : typeof data.customerName === 'string'
            ? data.customerName
            : '',
      avatar:
        customerObj && typeof customerObj.avatar === 'string'
          ? customerObj.avatar
          : null,
      address:
        customerObj && typeof customerObj.address === 'string'
          ? customerObj.address
          : typeof (delivery as { address?: unknown })?.address === 'string'
            ? ((delivery as { address: string }).address ?? null)
            : null,
    },
    driver:
      driverObj || data.driverId
        ? {
            id:
              driverObj && typeof driverObj.id === 'string'
                ? driverObj.id
                : typeof data.driverId === 'string'
                  ? data.driverId
                  : '',
            name:
              driverObj && typeof driverObj.name === 'string'
                ? driverObj.name
                : typeof data.driverName === 'string'
                  ? data.driverName
                  : '',
            phone:
              driverObj && typeof driverObj.phone === 'string'
                ? driverObj.phone
                : typeof data.driverPhone === 'string'
                  ? data.driverPhone
                  : null,
            vehicle:
              driverObj && typeof driverObj.vehicle === 'string'
                ? driverObj.vehicle
                : typeof data.driverVehicle === 'string'
                  ? data.driverVehicle
                  : null,
            avatar:
              driverObj && typeof driverObj.avatar === 'string'
                ? driverObj.avatar
                : null,
          }
        : null,
    acceptedAtMs: safeToMillis(data.acceptedAt),
    pickedUpAtMs: safeToMillis(data.pickedUpAt),
    deliveredAtMs: safeToMillis(data.deliveredAt),
    cancelledAtMs: safeToMillis(data.cancelledAt),
    deliveryPin:
      typeof data.deliveryPin === 'string' && /^\d{4}$/.test(data.deliveryPin)
        ? data.deliveryPin
        : null,
    routePolyline: typeof data.routePolyline === 'string' ? data.routePolyline : null,
  };
}

export type MarketplaceOrderCreatePayload = {
  userId: string;
  restaurantId: string;
  items: OrderItem[];
  totalPrice: number;
  deliveryType?: 'delivery' | 'pickup';
  driverId?: string | null;
  deliveryLocation: { lat: number; lng: number; address: string };
  customerLocation?: CustomerLocationRecord;
  restaurantLocation?: LatLng | null;
};

export async function createOrder(
  payload: MarketplaceOrderCreatePayload,
): Promise<string> {
  await ensureAuthReady();
  const customerUid = auth.currentUser?.uid?.trim() ?? '';
  if (!customerUid) {
    throw new Error('Please sign in first.');
  }

  const deliveryType = payload.deliveryType ?? 'delivery';

  let existingOrderId: string | null = null;
  try {
    const pendingSnap = await getDocs(
      query(
        collection(db, 'orders'),
        where('restaurantId', '==', payload.restaurantId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc'),
        limit(8),
      ),
    );
    const found = pendingSnap.docs.find((docSnap) => {
      const gd = docSnap.data();
      return gd.groupId == null || gd.groupId === '';
    });
    if (found) existingOrderId = found.id;
  } catch {
    /* query/index may be missing — still create order */
  }
  const groupId = existingOrderId ? `grp_${existingOrderId}` : makeGroupId();
  const estimatedDeliveryTime = existingOrderId ? 25 : 35;

  const { lat, lng } = payload.deliveryLocation;
  const userLocation: LatLng = { lat, lng };
  const customerLocationRecord: CustomerLocationRecord =
    payload.customerLocation ?? {
      latitude: lat,
      longitude: lng,
      timestamp: serverTimestamp(),
    };

  let restaurantLocation: LatLng;
  if (payload.restaurantLocation) {
    restaurantLocation = payload.restaurantLocation;
  } else {
    const restaurantRecord = await fetchRestaurantLocation(payload.restaurantId);
    restaurantLocation = restaurantLocationToLegacy(restaurantRecord);
  }
  let restaurantSnapshot: RestaurantSnapshot = {
    id: payload.restaurantId,
    name: '',
    image: null,
    address: null,
    latitude: restaurantLocation.lat,
    longitude: restaurantLocation.lng,
  };
  let customerSnapshot: CustomerSnapshot = {
    id: customerUid,
    name: '',
    avatar: null,
    address: payload.deliveryLocation.address,
  };
  try {
    const [restaurantSnap, customerSnap] = await Promise.all([
      getDoc(doc(db, 'restaurants', payload.restaurantId)),
      getDoc(doc(db, 'users', customerUid)),
    ]);
    if (restaurantSnap.exists()) {
      const r = restaurantSnap.data() as Record<string, unknown>;
      restaurantSnapshot = {
        id: payload.restaurantId,
        name:
          typeof r.name === 'string'
            ? r.name
            : typeof r.restaurantName === 'string'
              ? r.restaurantName
              : '',
        image:
          typeof r.image === 'string'
            ? r.image
            : typeof r.logoUrl === 'string'
              ? r.logoUrl
              : typeof r.photoUrl === 'string'
                ? r.photoUrl
                : null,
        address:
          typeof r.address === 'string'
            ? r.address
            : (r.location &&
                typeof r.location === 'object' &&
                typeof (r.location as { address?: unknown }).address === 'string'
              ? String((r.location as { address: string }).address)
              : null),
        latitude:
          typeof r.latitude === 'number'
            ? r.latitude
            : typeof r.lat === 'number'
              ? r.lat
              : restaurantLocation.lat,
        longitude:
          typeof r.longitude === 'number'
            ? r.longitude
            : typeof r.lng === 'number'
              ? r.lng
              : restaurantLocation.lng,
      };
    }
    if (customerSnap.exists()) {
      const u = customerSnap.data() as Record<string, unknown>;
      customerSnapshot = {
        id: customerUid,
        name: typeof u.name === 'string' ? u.name : '',
        avatar:
          typeof u.avatar === 'string'
            ? u.avatar
            : typeof u.photoURL === 'string'
              ? u.photoURL
              : null,
        address: payload.deliveryLocation.address,
      };
    }
  } catch {
    // Keep snapshot fallbacks and still create order.
  }

  if (payload.userId.trim() !== customerUid) {
    console.warn('[createOrder] payload.userId mismatch; using auth uid', {
      payloadUserId: payload.userId,
      customerUid,
      restaurantId: payload.restaurantId,
    });
  }

  const orderPayload = {
    userId: customerUid,
    customerId: customerUid,
    restaurantId: payload.restaurantId,
    venueId: payload.restaurantId,
    items: payload.items,
    customerName: null,
    customerPhone: null,
    subtotal: payload.totalPrice,
    tax: 0,
    deliveryFee: 0,
    totalPrice: payload.totalPrice,
    total: payload.totalPrice,
    deliveryType,
    estimatedPrepTime: estimatedDeliveryTime,
    status: 'awaiting_payment',
    deliveryStatus: 'pending',
    paymentStatus: 'unpaid',
    stripePaymentIntentId: null,
    paymentIntentId: null,
    checkoutSessionId: null,
    groupId,
    estimatedDeliveryTime,
    driverId: payload.driverId ?? null,
    assignedDriverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    driverLocation: null,
    deliveryLocation: payload.deliveryLocation,
    deliveryAddress: payload.deliveryLocation.address,
    customerLocation: customerLocationRecord,
    restaurant: restaurantSnapshot,
    customer: customerSnapshot,
    driver: {
      id: payload.driverId ?? null,
      name: null,
      phone: null,
      vehicle: null,
      avatar: null,
    },
    userLocation,
    restaurantLocation,
    notes: null,
    acceptedAt: null,
    preparedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    estimatedArrival: null,
    fees: 0,
    taxes: 0,
    etaMinutes: estimatedDeliveryTime,
    createdAt: serverTimestamp(),
    hiddenForRestaurant: false,
    archivedByRestaurant: false,
    archivedAt: null,
    hiddenAt: null,
    restoredAt: null,
  };
  console.log('ORDER INITIAL DELIVERY STATUS', orderPayload.deliveryStatus);
  console.log('ORDER CREATE CUSTOMER UID', customerUid);
  console.log('ORDER CREATE RESTAURANT UID', payload.restaurantId);
  console.log('ORDER CREATE PAYLOAD', orderPayload);

  let ref;
  try {
    ref = await addDoc(collection(db, 'orders'), orderPayload);
  } catch (err) {
    console.error('[createOrder] Firestore write failed', {
      code: (err as { code?: string })?.code,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  return ref.id;
}

export async function getRestaurantOrderById(orderId: string): Promise<RestaurantOrder | null> {
  const trimmed = typeof orderId === 'string' ? orderId.trim() : '';
  if (!trimmed) return null;
  const snap = await getDoc(doc(db, 'orders', trimmed));
  if (!snap.exists()) return null;
  return mapDocToRestaurantOrder({
    id: snap.id,
    data: () => snap.data() as Record<string, unknown>,
  });
}

export async function rejectOrder(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'rejected',
    estimatedDeliveryTime: 0,
    updatedAt: serverTimestamp(),
  });
}

const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  'awaiting_payment',
  'payment_processing',
  'payment_confirmed',
  'pending',
  'pending_driver',
  'accepted',
  'restaurant_accepted',
  'preparing',
];

export function customerCanCancelMarketplaceOrder(status: OrderStatus): boolean {
  return CUSTOMER_CANCELLABLE_STATUSES.includes(status);
}

export async function customerCancelMarketplaceOrder(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'cancelled',
    deliveryStatus: 'cancelled',
    updatedAt: serverTimestamp(),
    cancelledAt: serverTimestamp(),
    cancelledBy: 'customer',
  });
}

export type GetRestaurantOrdersOptions = {
  timeZone?: string;
};

export function getOrders(
  restaurantId: string,
  onData: (orders: RestaurantOrder[]) => void,
  options?: GetRestaurantOrdersOptions,
): Unsubscribe {
  const unsub = onSnapshot(
    query(
      collection(db, 'orders'),
      where('restaurantId', '==', restaurantId),
      orderBy('createdAt', 'desc'),
      limit(RESTAURANT_ORDERS_LIST_LIMIT),
    ),
    (snap) => {
      try {
        const rows = snap.docs.map((docSnap) =>
          mapDocToRestaurantOrder(docSnap, restaurantId, {
            timeZone: options?.timeZone,
          }),
        );
        onData(filterFreshRestaurantOrders(rows));
      } catch (e) {
        if (__DEV__) {
          console.error('[getOrders:restaurantId]', e);
        }
        onData([]);
      }
    },
    () => {
      onData([]);
    },
  );

  return () => {
    unsub();
  };
}

function etaForStatus(status: OrderStatus): number {
  switch (status) {
    case 'awaiting_payment':
      return 0;
    case 'payment_processing':
      return 2;
    case 'payment_failed':
      return 0;
    case 'pending_driver':
      return 30;
    case 'driver_accepted':
    case 'driver_assigned':
      return 24;
    case 'arriving_restaurant':
      return 20;
    case 'picked_up_pending':
      return 18;
    case 'accepted':
    case 'restaurant_accepted':
      return 28;
    case 'preparing':
      return 22;
    case 'ready':
    case 'ready_for_pickup':
      return 18;
    case 'picked_up':
      return 14;
    case 'on_the_way':
      return 10;
    case 'arrived_customer':
      return 4;
    case 'delivered':
    case 'cancelled':
    case 'rejected':
      return 0;
    default:
      return 35;
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const normalizedStatus: OrderStatus = status === 'ready' ? 'ready_for_pickup' : status;
  const patch: Record<string, unknown> = {
    status: normalizedStatus,
    estimatedDeliveryTime: etaForStatus(normalizedStatus),
    updatedAt: serverTimestamp(),
  };
  if (normalizedStatus === 'accepted' || normalizedStatus === 'restaurant_accepted') {
    patch.acceptedAt = serverTimestamp();
    patch.deliveryStatus = 'accepted';
  }
  if (normalizedStatus === 'preparing') {
    patch.deliveryStatus = 'preparing';
  }
  if (normalizedStatus === 'ready_for_pickup') {
    patch.preparedAt = serverTimestamp();
    patch.deliveryStatus = 'ready_for_pickup';
    patch.driverId = null;
    patch.assignedDriverId = null;
    patch.driverName = null;
    patch.driverPhone = null;
    patch.readyAt = serverTimestamp();
    if (__DEV__) {
      console.log('[MARKETPLACE READY]', {
        orderId,
        deliveryStatus: 'ready_for_pickup',
        archived: false,
        expired: false,
        insertedIntoPool: true,
      });
    }
  }
  if (
    normalizedStatus === 'picked_up_pending'
    || normalizedStatus === 'driver_assigned'
    || normalizedStatus === 'arriving_restaurant'
    || normalizedStatus === 'driver_accepted'
  ) {
    patch.deliveryStatus = 'driver_assigned';
  }
  if (normalizedStatus === 'picked_up') {
    patch.pickedUpAt = serverTimestamp();
    patch.deliveryStatus = 'picked_up';
  }
  if (normalizedStatus === 'delivered') {
    patch.deliveredAt = serverTimestamp();
    patch.deliveryStatus = 'delivered';
    patch.status = 'completed';
  }
  if (normalizedStatus === 'arrived_customer') {
    patch.deliveryStatus = 'near_customer';
  }
  if (__DEV__) {
    console.log('[DRIVER FLOW] updateOrderStatus', {
      orderId,
      requestedStatus: status,
      status: patch.status,
      deliveryStatus: patch.deliveryStatus ?? null,
      driverId: patch.driverId ?? '(unchanged)',
    });
  }
  await updateDoc(doc(db, 'orders', orderId), patch);
}

/** Live driver pin on the order (for customer map). */
export async function updateOrderDriverLocation(
  orderId: string,
  location: LatLng,
): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    driverLocation: {
      lat: location.lat,
      lng: location.lng,
      ...(typeof location.heading === 'number' && Number.isFinite(location.heading)
        ? { heading: location.heading }
        : {}),
    },
  });
}

export function looksLikeMarketplaceRestaurantOrder(o: RestaurantOrder): boolean {
  return (
    typeof o.restaurantId === 'string' &&
    o.restaurantId.trim().length > 0 &&
    o.deliveryLocation != null &&
    typeof o.deliveryLocation.address === 'string'
  );
}

export function subscribeOrderById(
  orderId: string,
  onData: (order: RestaurantOrder | null) => void,
  options?: { onListenError?: (err: Error) => void },
): Unsubscribe {
  return onSnapshot(
    doc(db, 'orders', orderId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      try {
        onData(mapDocToRestaurantOrder(snap));
      } catch (e) {
        console.warn('[subscribeOrderById] mapDoc failed', orderId, e);
        options?.onListenError?.(e instanceof Error ? e : new Error(String(e)));
      }
    },
    (err) => {
      console.warn('[subscribeOrderById] listener error (keeping UI stable)', orderId, err);
      options?.onListenError?.(err);
    },
  );
}
