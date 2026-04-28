import { db } from '@/services/firebase';
import {
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  collection,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type DeliveryStatus =
  | 'waiting'
  | 'matched'
  | 'preparing'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered';

export type LatLng = { lat: number; lng: number };

export type DeliveryDoc = {
  id: string;
  orderId: string;
  driverId: string;
  status: 'preparing' | 'picked_up' | 'on_the_way' | 'delivered';
  driverLocation: LatLng | null;
  eta: number;
};

export type DriverDoc = {
  id: string;
  name: string;
  rating: number;
  vehicle: string;
  currentLocation: LatLng | null;
  photoUrl: string | null;
};

export type OrderSummary = {
  orderId: string;
  status: 'waiting' | 'matched' | 'completed';
  usersCount: number;
  mealName: string;
  restaurantName: string;
  restaurantLocationText: string;
  restaurantLocation: LatLng | null;
  userLocation: LatLng | null;
};

function parseLatLng(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const lat = typeof obj.lat === 'number' ? obj.lat : null;
  const lng = typeof obj.lng === 'number' ? obj.lng : null;
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function subscribeDeliveryByOrderId(
  orderId: string,
  onData: (delivery: DeliveryDoc | null) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'deliveries'),
    where('orderId', '==', orderId),
    limit(1),
  );
  return onSnapshot(q, (snap) => {
    const row = snap.docs[0];
    if (!row) {
      onData(null);
      return;
    }
    const d = row.data() as Record<string, unknown>;
    onData({
      id: row.id,
      orderId,
      driverId: typeof d.driverId === 'string' ? d.driverId : '',
      status:
        d.status === 'picked_up' ||
        d.status === 'on_the_way' ||
        d.status === 'delivered'
          ? d.status
          : 'preparing',
      driverLocation: parseLatLng(d.driverLocation),
      eta: typeof d.eta === 'number' ? d.eta : 0,
    });
  });
}

export function subscribeDriver(
  driverId: string,
  onData: (driver: DriverDoc | null) => void,
): Unsubscribe {
  if (!driverId) {
    onData(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'drivers', driverId), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    const d = snap.data() as Record<string, unknown>;
    onData({
      id: snap.id,
      name: typeof d.name === 'string' ? d.name : 'Driver',
      rating: typeof d.rating === 'number' ? d.rating : 4.8,
      vehicle: typeof d.vehicle === 'string' ? d.vehicle : 'Vehicle',
      currentLocation: parseLatLng(d.currentLocation),
      photoUrl: typeof d.photoUrl === 'string' ? d.photoUrl : null,
    });
  });
}

export async function getOrderSummary(orderId: string): Promise<OrderSummary | null> {
  const orderSnap = await getDoc(doc(db, 'orders', orderId));
  if (!orderSnap.exists()) return null;
  const order = orderSnap.data() as Record<string, unknown>;
  const mealId = typeof order.mealId === 'string' ? order.mealId : '';
  const restaurantId =
    typeof order.restaurantId === 'string' ? order.restaurantId : '';
  const [mealSnap, restaurantSnap] = await Promise.all([
    mealId ? getDoc(doc(db, 'meals', mealId)) : Promise.resolve(null),
    restaurantId ? getDoc(doc(db, 'restaurants', restaurantId)) : Promise.resolve(null),
  ]);

  const mealName =
    mealSnap && mealSnap.exists() && typeof mealSnap.data()?.name === 'string'
      ? (mealSnap.data()?.name as string)
      : 'Meal';
  const restName =
    restaurantSnap &&
    restaurantSnap.exists() &&
    typeof restaurantSnap.data()?.name === 'string'
      ? (restaurantSnap.data()?.name as string)
      : 'Restaurant';
  const restLocationText =
    restaurantSnap &&
    restaurantSnap.exists() &&
    typeof restaurantSnap.data()?.location === 'string'
      ? (restaurantSnap.data()?.location as string)
      : 'Toronto';

  return {
    orderId,
    status:
      order.status === 'matched' || order.status === 'completed'
        ? order.status
        : 'waiting',
    usersCount: typeof order.usersCount === 'number' ? order.usersCount : 0,
    mealName,
    restaurantName: restName,
    restaurantLocationText: restLocationText,
    restaurantLocation:
      parseLatLng(restaurantSnap?.data()?.locationCoords) ??
      parseLatLng(order.restaurantLocation) ?? {
        lat: 43.6532,
        lng: -79.3832,
      },
    userLocation:
      parseLatLng(order.userLocation) ??
      parseLatLng(order.customerLocation) ?? {
        lat: 43.661,
        lng: -79.39,
      },
  };
}

export function deriveTrackingStatus(
  orderStatus: OrderSummary['status'],
  deliveryStatus: DeliveryDoc['status'] | null,
): DeliveryStatus {
  if (orderStatus === 'waiting') return 'waiting';
  if (orderStatus === 'matched' && !deliveryStatus) return 'matched';
  if (!deliveryStatus) return 'preparing';
  if (deliveryStatus === 'delivered') return 'delivered';
  if (deliveryStatus === 'on_the_way') return 'on_the_way';
  if (deliveryStatus === 'picked_up') return 'picked_up';
  return 'preparing';
}
