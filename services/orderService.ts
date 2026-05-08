import { db } from './firebase';
import { normalizeDeliveryStatus, type DeliveryStatus } from './deliveryStatus';
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

/** Full delivery lifecycle (plus rejected / ready for handoff). */
export type OrderStatus =
  | 'awaiting_payment'
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

export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
};

export type LatLng = { lat: number; lng: number };

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
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverVehicle: string | null;
  groupId: string | null;
  estimatedDeliveryTime: number;
  deliveryLocation: { lat: number; lng: number; address: string } | null;
  userLocation: LatLng | null;
  restaurantLocation: LatLng | null;
  driverLocation: LatLng | null;
  notes: string | null;
  createdAtLabel: string;
  /** Firestore `createdAt` millis when available (for “today” stats). */
  createdAtMs: number | null;
};

function makeGroupId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseStatus(value: unknown): OrderStatus {
  const s = typeof value === 'string' ? value : '';
  if (
    s === 'awaiting_payment' ||
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
  if (p === 'paid' || p === 'unpaid' || p === 'failed' || p === 'refunded') return p;
  return orderStatus === 'awaiting_payment' ? 'unpaid' : 'paid';
}

function parseLatLng(value: unknown): LatLng | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const lat = typeof o.lat === 'number' ? o.lat : Number(o.lat);
  const lng = typeof o.lng === 'number' ? o.lng : Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toCreatedAtLabel(value: unknown): string {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date })
      .toDate()
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return 'Now';
}

function toCreatedAtMs(value: unknown): number | null {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: () => number }).toMillis === 'function'
  ) {
    try {
      const ms = (value as { toMillis: () => number }).toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (
    value &&
    typeof value === 'object' &&
    'seconds' in value &&
    typeof (value as { seconds: unknown }).seconds === 'number'
  ) {
    return (value as { seconds: number }).seconds * 1000;
  }
  return null;
}

function mapDocToRestaurantOrder(
  d: { id: string; data: () => Record<string, unknown> },
  fallbackRestaurantId?: string,
): RestaurantOrder {
  const data = d.data();
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
  const delivery = data.deliveryLocation;
  const userLoc = parseLatLng(data.userLocation) ?? parseLatLng(delivery);
  const restLoc =
    parseLatLng(data.restaurantLocation) ??
    (userLoc ? { lat: userLoc.lat + 0.01, lng: userLoc.lng + 0.01 } : null);

  const status = parseStatus(data.status);

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
        : null,
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
    userLocation: userLoc,
    restaurantLocation: restLoc,
    driverLocation: parseLatLng(data.driverLocation),
    notes: typeof data.notes === 'string' ? data.notes : null,
    createdAtLabel: toCreatedAtLabel(data.createdAt),
    createdAtMs: toCreatedAtMs(data.createdAt),
  };
}

export async function createOrder(payload: {
  userId: string;
  restaurantId: string;
  items: OrderItem[];
  totalPrice: number;
  driverId?: string | null;
  deliveryLocation: { lat: number; lng: number; address: string };
  restaurantLocation?: LatLng | null;
}): Promise<string> {
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
  const restaurantLocation =
    payload.restaurantLocation ??
    ({ lat: lat + 0.015, lng: lng + 0.015 } as LatLng);

  console.log('[createOrder] about to save order', {
    venueId: payload.restaurantId,
    restaurantId: payload.restaurantId,
    userId: payload.userId,
    paymentStatus: 'unpaid',
  });

  const ref = await addDoc(collection(db, 'orders'), {
    userId: payload.userId,
    customerId: payload.userId,
    restaurantId: payload.restaurantId,
    // Backward/alt schema compatibility for dashboards or older clients.
    venueId: payload.restaurantId,
    items: payload.items,
    customerName: null,
    customerPhone: null,
    subtotal: payload.totalPrice,
    tax: 0,
    deliveryFee: 0,
    totalPrice: payload.totalPrice,
    total: payload.totalPrice,
    deliveryType: 'delivery',
    estimatedPrepTime: estimatedDeliveryTime,
    status: 'awaiting_payment',
    deliveryStatus: 'waiting_driver',
    paymentStatus: 'unpaid',
    stripePaymentIntentId: null,
    groupId,
    estimatedDeliveryTime,
    driverId: payload.driverId ?? null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    driverLocation: null,
    deliveryLocation: payload.deliveryLocation,
    deliveryAddress: payload.deliveryLocation.address,
    userLocation,
    restaurantLocation,
    notes: null,
    acceptedAt: null,
    preparedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    estimatedArrival: null,
    createdAt: serverTimestamp(),
  });
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
  });
}

export function getOrders(
  restaurantId: string,
  onData: (orders: RestaurantOrder[]) => void,
): Unsubscribe {
  const unsub = onSnapshot(
    query(
      collection(db, 'orders'),
      where('restaurantId', '==', restaurantId),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      try {
        console.log('Current restaurant UID:', restaurantId);
        console.log('Orders found:', snap.docs.length);
        console.log(snap.docs.map((d) => d.data()));
        const rows = snap.docs.map((docSnap) =>
          mapDocToRestaurantOrder(docSnap, restaurantId),
        );
        onData(rows);
      } catch (e) {
        console.error('[getOrders:restaurantId]', e);
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
  };
  if (normalizedStatus === 'accepted' || normalizedStatus === 'restaurant_accepted') {
    patch.acceptedAt = serverTimestamp();
  }
  if (normalizedStatus === 'ready_for_pickup') {
    patch.preparedAt = serverTimestamp();
    patch.deliveryStatus = 'waiting_driver';
    patch.driverId = null;
    patch.assignedDriverId = null;
    patch.driverName = null;
    patch.driverPhone = null;
    patch.readyAt = serverTimestamp();
  }
  if (normalizedStatus === 'picked_up_pending' || normalizedStatus === 'driver_assigned') {
    patch.deliveryStatus = 'driver_assigned';
  }
  if (normalizedStatus === 'picked_up') {
    patch.pickedUpAt = serverTimestamp();
    patch.deliveryStatus = 'picked_up';
  }
  if (normalizedStatus === 'delivered') {
    patch.deliveredAt = serverTimestamp();
    patch.deliveryStatus = 'delivered';
  }
  if (normalizedStatus === 'arrived_customer') {
    patch.deliveryStatus = 'near_customer';
  }
  console.log('[DRIVER FLOW] updateOrderStatus', {
    orderId,
    requestedStatus: status,
    status: patch.status,
    deliveryStatus: patch.deliveryStatus ?? null,
    driverId: patch.driverId ?? '(unchanged)',
  });
  await updateDoc(doc(db, 'orders', orderId), patch);
}

/** Live driver pin on the order (for customer map). */
export async function updateOrderDriverLocation(
  orderId: string,
  location: LatLng,
): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    driverLocation: { lat: location.lat, lng: location.lng },
  });
}

export function subscribeOrderById(
  orderId: string,
  onData: (order: RestaurantOrder | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'orders', orderId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(mapDocToRestaurantOrder(snap));
    },
    () => onData(null),
  );
}
