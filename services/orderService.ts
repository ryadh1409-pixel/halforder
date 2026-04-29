import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  doc,
  type Unsubscribe,
} from 'firebase/firestore';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'on_the_way'
  | 'delivered';

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
};

export type RestaurantOrder = {
  id: string;
  userId: string;
  restaurantId: string;
  items: OrderItem[];
  totalPrice: number;
  status: OrderStatus;
  driverId: string | null;
  driverName: string | null;
  groupId: string | null;
  estimatedDeliveryTime: number;
  deliveryLocation: { lat: number; lng: number; address: string } | null;
  createdAtLabel: string;
};

function makeGroupId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseStatus(value: unknown): OrderStatus {
  return value === 'accepted' || value === 'on_the_way' || value === 'delivered'
    ? value
    : 'pending';
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

export async function createOrder(payload: {
  userId: string;
  restaurantId: string;
  items: OrderItem[];
  totalPrice: number;
  driverId?: string | null;
  deliveryLocation: { lat: number; lng: number; address: string };
}): Promise<string> {
  const tenMinutesAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
  const pendingGroupCandidate = await getDocs(
    query(
      collection(db, 'orders'),
      where('restaurantId', '==', payload.restaurantId),
      where('status', '==', 'pending'),
      where('groupId', '==', null),
      where('createdAt', '>=', tenMinutesAgo),
      orderBy('createdAt', 'desc'),
      limit(1),
    ),
  );
  const existingOrder = pendingGroupCandidate.docs[0];
  const groupId = existingOrder ? `grp_${existingOrder.id}` : makeGroupId();
  const estimatedDeliveryTime = existingOrder ? 25 : 35;

  const ref = await addDoc(collection(db, 'orders'), {
    userId: payload.userId,
    customerId: payload.userId,
    restaurantId: payload.restaurantId,
    items: payload.items,
    totalPrice: payload.totalPrice,
    total: payload.totalPrice,
    status: 'pending',
    groupId,
    estimatedDeliveryTime,
    driverId: payload.driverId ?? null,
    driverName: null,
    deliveryLocation: payload.deliveryLocation,
    createdAt: serverTimestamp(),
  });
  return ref.id;
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
      onData(
        snap.docs.map((d) => {
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
          return {
            id: d.id,
            userId:
              typeof data.userId === 'string'
                ? data.userId
                : typeof data.customerId === 'string'
                  ? data.customerId
                  : '',
            restaurantId,
            items,
            totalPrice:
              typeof data.totalPrice === 'number'
                ? data.totalPrice
                : typeof data.total === 'number'
                  ? data.total
                  : 0,
            status: parseStatus(data.status),
            groupId: typeof data.groupId === 'string' ? data.groupId : null,
            estimatedDeliveryTime:
              typeof data.estimatedDeliveryTime === 'number' ? data.estimatedDeliveryTime : 35,
            driverId: typeof data.driverId === 'string' ? data.driverId : null,
            driverName: typeof data.driverName === 'string' ? data.driverName : null,
            deliveryLocation:
              data.deliveryLocation &&
              typeof data.deliveryLocation === 'object' &&
              typeof (data.deliveryLocation as { lat?: unknown }).lat === 'number' &&
              typeof (data.deliveryLocation as { lng?: unknown }).lng === 'number' &&
              typeof (data.deliveryLocation as { address?: unknown }).address === 'string'
                ? {
                    lat: (data.deliveryLocation as { lat: number }).lat,
                    lng: (data.deliveryLocation as { lng: number }).lng,
                    address: (data.deliveryLocation as { address: string }).address,
                  }
                : null,
            createdAtLabel: toCreatedAtLabel(data.createdAt),
          };
        }),
      );
    },
    () => onData([]),
  );
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const estimatedDeliveryTime =
    status === 'accepted'
      ? 30
      : status === 'on_the_way'
        ? 12
        : status === 'delivered'
          ? 0
          : 35;
  await updateDoc(doc(db, 'orders', orderId), { status, estimatedDeliveryTime });
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
      const data = snap.data();
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
      onData({
        id: snap.id,
        userId:
          typeof data.userId === 'string'
            ? data.userId
            : typeof data.customerId === 'string'
              ? data.customerId
              : '',
        restaurantId: typeof data.restaurantId === 'string' ? data.restaurantId : '',
        items,
        totalPrice:
          typeof data.totalPrice === 'number'
            ? data.totalPrice
            : typeof data.total === 'number'
              ? data.total
              : 0,
        status: parseStatus(data.status),
        groupId: typeof data.groupId === 'string' ? data.groupId : null,
        estimatedDeliveryTime:
          typeof data.estimatedDeliveryTime === 'number' ? data.estimatedDeliveryTime : 35,
        driverId: typeof data.driverId === 'string' ? data.driverId : null,
        driverName: typeof data.driverName === 'string' ? data.driverName : null,
        deliveryLocation:
          data.deliveryLocation &&
          typeof data.deliveryLocation === 'object' &&
          typeof (data.deliveryLocation as { lat?: unknown }).lat === 'number' &&
          typeof (data.deliveryLocation as { lng?: unknown }).lng === 'number' &&
          typeof (data.deliveryLocation as { address?: unknown }).address === 'string'
            ? {
                lat: (data.deliveryLocation as { lat: number }).lat,
                lng: (data.deliveryLocation as { lng: number }).lng,
                address: (data.deliveryLocation as { address: string }).address,
              }
            : null,
        createdAtLabel: toCreatedAtLabel(data.createdAt),
      });
    },
    () => onData(null),
  );
}
