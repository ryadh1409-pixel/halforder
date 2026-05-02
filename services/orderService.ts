import { db } from './firebase';
import {
  addDoc,
  collection,
  doc,
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
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
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
  restaurantId: string;
  items: OrderItem[];
  totalPrice: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  stripeCheckoutSessionId: string | null;
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
  createdAtLabel: string;
};

function makeGroupId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseStatus(value: unknown): OrderStatus {
  const s = typeof value === 'string' ? value : '';
  if (
    s === 'awaiting_payment' ||
    s === 'pending' ||
    s === 'accepted' ||
    s === 'preparing' ||
    s === 'ready' ||
    s === 'picked_up' ||
    s === 'on_the_way' ||
    s === 'delivered' ||
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
    restaurantId: rid,
    items,
    totalPrice:
      typeof data.totalPrice === 'number'
        ? data.totalPrice
        : typeof data.total === 'number'
          ? data.total
          : 0,
    status,
    paymentStatus: parsePaymentStatus(data.paymentStatus, status),
    stripeCheckoutSessionId:
      typeof data.stripeCheckoutSessionId === 'string'
        ? data.stripeCheckoutSessionId
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
    createdAtLabel: toCreatedAtLabel(data.createdAt),
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

  const { lat, lng, address } = payload.deliveryLocation;
  const userLocation: LatLng = { lat, lng };
  const restaurantLocation =
    payload.restaurantLocation ??
    ({ lat: lat + 0.015, lng: lng + 0.015 } as LatLng);

  const ref = await addDoc(collection(db, 'orders'), {
    userId: payload.userId,
    customerId: payload.userId,
    restaurantId: payload.restaurantId,
    items: payload.items,
    totalPrice: payload.totalPrice,
    total: payload.totalPrice,
    status: 'awaiting_payment',
    paymentStatus: 'unpaid',
    stripeCheckoutSessionId: null,
    groupId,
    estimatedDeliveryTime,
    driverId: payload.driverId ?? null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    driverLocation: null,
    deliveryLocation: payload.deliveryLocation,
    userLocation,
    restaurantLocation,
    createdAt: serverTimestamp(),
  });
  return ref.id;
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
  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('restaurantId', '==', restaurantId),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      onData(snap.docs.map((docSnap) => mapDocToRestaurantOrder(docSnap, restaurantId)));
    },
    () => onData([]),
  );
}

function etaForStatus(status: OrderStatus): number {
  switch (status) {
    case 'awaiting_payment':
      return 0;
    case 'accepted':
      return 28;
    case 'preparing':
      return 22;
    case 'ready':
      return 18;
    case 'picked_up':
      return 14;
    case 'on_the_way':
      return 10;
    case 'delivered':
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
  const patch: Record<string, unknown> = {
    status,
    estimatedDeliveryTime: etaForStatus(status),
  };
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
