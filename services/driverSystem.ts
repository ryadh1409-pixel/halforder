import { auth, db } from '@/services/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type DriverProfile = {
  id: string;
  name: string;
  rating: number;
  vehicle: string;
  isOnline: boolean;
  currentLocation: { lat: number; lng: number } | null;
  activeOrderId: string | null;
};

export type DriverDelivery = {
  id: string;
  orderId: string;
  driverId: string;
  status: 'assigned' | 'accepted' | 'picked_up' | 'on_the_way' | 'delivered';
  eta: number;
  driverLocation: { lat: number; lng: number } | null;
};

function parseLatLng(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const lat = typeof o.lat === 'number' ? o.lat : null;
  const lng = typeof o.lng === 'number' ? o.lng : null;
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function getCurrentDriverId(): string | null {
  return auth.currentUser?.uid ?? null;
}

export function subscribeDriverProfile(
  driverId: string,
  onData: (driver: DriverProfile | null) => void,
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
      vehicle: typeof d.vehicle === 'string' ? d.vehicle : 'Scooter',
      isOnline: d.isOnline === true,
      currentLocation: parseLatLng(d.currentLocation),
      activeOrderId: typeof d.activeOrderId === 'string' ? d.activeOrderId : null,
    });
  });
}

export function subscribeDriverIncomingDelivery(
  driverId: string,
  onData: (delivery: DriverDelivery | null) => void,
): Unsubscribe {
  if (!driverId) {
    onData(null);
    return () => {};
  }
  const q = query(
    collection(db, 'deliveries'),
    where('driverId', '==', driverId),
    where('status', '==', 'assigned'),
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
      orderId: typeof d.orderId === 'string' ? d.orderId : '',
      driverId,
      status: 'assigned',
      eta: typeof d.eta === 'number' ? d.eta : 0,
      driverLocation: parseLatLng(d.driverLocation),
    });
  });
}

export function subscribeDriverActiveDelivery(
  driverId: string,
  onData: (delivery: DriverDelivery | null) => void,
): Unsubscribe {
  if (!driverId) {
    onData(null);
    return () => {};
  }
  const q = query(
    collection(db, 'deliveries'),
    where('driverId', '==', driverId),
    where('status', 'in', ['accepted', 'picked_up', 'on_the_way']),
  );
  return onSnapshot(q, (snap) => {
    const row = snap.docs[0];
    if (!row) {
      onData(null);
      return;
    }
    const d = row.data() as Record<string, unknown>;
    const statusRaw = typeof d.status === 'string' ? d.status : 'accepted';
    const status: DriverDelivery['status'] =
      statusRaw === 'picked_up' || statusRaw === 'on_the_way'
        ? statusRaw
        : 'accepted';
    onData({
      id: row.id,
      orderId: typeof d.orderId === 'string' ? d.orderId : '',
      driverId,
      status,
      eta: typeof d.eta === 'number' ? d.eta : 0,
      driverLocation: parseLatLng(d.driverLocation),
    });
  });
}

export async function setDriverOnline(driverId: string, isOnline: boolean): Promise<void> {
  await updateDoc(doc(db, 'drivers', driverId), { isOnline, updatedAt: serverTimestamp() });
}

export async function acceptDelivery(deliveryId: string, driverId: string, orderId: string): Promise<void> {
  await updateDoc(doc(db, 'deliveries', deliveryId), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'drivers', driverId), {
    activeOrderId: orderId,
    updatedAt: serverTimestamp(),
  });
}

export async function rejectDelivery(deliveryId: string): Promise<void> {
  await updateDoc(doc(db, 'deliveries', deliveryId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}

export async function updateDeliveryStatus(deliveryId: string, status: DriverDelivery['status']): Promise<void> {
  await updateDoc(doc(db, 'deliveries', deliveryId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function completeDelivery(deliveryId: string, driverId: string, orderId: string): Promise<void> {
  await updateDoc(doc(db, 'deliveries', deliveryId), {
    status: 'delivered',
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'completed',
    completedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'drivers', driverId), {
    activeOrderId: null,
    updatedAt: serverTimestamp(),
  });
}

export async function updateDriverLocation(
  driverId: string,
  location: { lat: number; lng: number },
): Promise<void> {
  await updateDoc(doc(db, 'drivers', driverId), {
    currentLocation: location,
    updatedAt: serverTimestamp(),
  });
  const q = query(
    collection(db, 'deliveries'),
    where('driverId', '==', driverId),
    where('status', 'in', ['accepted', 'picked_up', 'on_the_way']),
  );
  const snap = await getDocs(q);
  await Promise.all(
    snap.docs.map((d) =>
      updateDoc(doc(db, 'deliveries', d.id), {
        driverLocation: location,
        updatedAt: serverTimestamp(),
      }),
    ),
  );
}

export async function getOrderRoutePoints(orderId: string): Promise<{
  restaurant: { lat: number; lng: number };
  customer: { lat: number; lng: number };
  restaurantName: string;
  customerName: string;
}> {
  const orderSnap = await getDoc(doc(db, 'orders', orderId));
  const order = orderSnap.exists() ? (orderSnap.data() as Record<string, unknown>) : {};
  const restaurantId = typeof order.restaurantId === 'string' ? order.restaurantId : '';
  const restaurantSnap = restaurantId ? await getDoc(doc(db, 'restaurants', restaurantId)) : null;
  const restaurantRaw = restaurantSnap?.exists() ? (restaurantSnap.data() as Record<string, unknown>) : {};
  const restaurant = parseLatLng(restaurantRaw.locationCoords) ?? parseLatLng(order.restaurantLocation) ?? { lat: 43.6532, lng: -79.3832 };
  const customer = parseLatLng(order.userLocation) ?? parseLatLng(order.customerLocation) ?? { lat: 43.666, lng: -79.39 };
  return {
    restaurant,
    customer,
    restaurantName: typeof restaurantRaw.name === 'string' ? restaurantRaw.name : 'Restaurant',
    customerName: 'Customer',
  };
}

export async function ensureDriverProfile(driverId: string): Promise<void> {
  const ref = doc(db, 'drivers', driverId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    name: 'New Driver',
    rating: 4.9,
    vehicle: 'Bike',
    isOnline: false,
    currentLocation: { lat: 43.6532, lng: -79.3832 },
    activeOrderId: null,
    createdAt: serverTimestamp(),
  });
}
