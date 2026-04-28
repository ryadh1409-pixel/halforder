import { db } from '@/services/firebase';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type MarketplaceMeal = {
  id: string;
  restaurantId: string;
  name: string;
  fullPrice: number;
  sharedPrice: number;
  threshold: number;
  isActive: boolean;
};

export type MarketplaceRestaurant = {
  id: string;
  name: string;
  location: string;
  ownerId: string;
  isOpen: boolean;
};

export type MarketplaceOrder = {
  id: string;
  mealId: string;
  restaurantId: string;
  users: string[];
  usersCount: number;
  status: 'waiting' | 'matched' | 'completed';
};

export function subscribeActiveMeals(
  onData: (rows: MarketplaceMeal[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'meals'), where('isActive', '==', true));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const thresholdRaw =
        typeof data.threshold === 'number' ? data.threshold : 2;
      return {
        id: d.id,
        restaurantId:
          typeof data.restaurantId === 'string' ? data.restaurantId : '',
        name: typeof data.name === 'string' ? data.name : 'Meal',
        fullPrice: typeof data.fullPrice === 'number' ? data.fullPrice : 0,
        sharedPrice: typeof data.sharedPrice === 'number' ? data.sharedPrice : 0,
        threshold: Math.max(2, Math.min(3, thresholdRaw)),
        isActive: true,
      } satisfies MarketplaceMeal;
    });
    onData(rows);
  });
}

export function subscribeOpenOrders(
  onData: (rows: MarketplaceOrder[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'orders'),
    where('status', 'in', ['waiting', 'matched']),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const users = Array.isArray(data.users)
        ? data.users.filter((x): x is string => typeof x === 'string')
        : [];
      const statusRaw = typeof data.status === 'string' ? data.status : 'waiting';
      const status: MarketplaceOrder['status'] =
        statusRaw === 'matched' || statusRaw === 'completed'
          ? statusRaw
          : 'waiting';
      return {
        id: d.id,
        mealId: typeof data.mealId === 'string' ? data.mealId : '',
        restaurantId:
          typeof data.restaurantId === 'string' ? data.restaurantId : '',
        users,
        usersCount: typeof data.usersCount === 'number' ? data.usersCount : users.length,
        status,
      } satisfies MarketplaceOrder;
    });
    onData(rows);
  });
}

export async function getRestaurantById(
  restaurantId: string,
): Promise<MarketplaceRestaurant | null> {
  const snap = await getDoc(doc(db, 'restaurants', restaurantId));
  if (!snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    name: typeof d.name === 'string' ? d.name : 'Restaurant',
    location: typeof d.location === 'string' ? d.location : 'Unknown',
    ownerId: typeof d.ownerId === 'string' ? d.ownerId : '',
    isOpen: d.isOpen !== false,
  };
}

export async function createOrder(params: {
  meal: MarketplaceMeal;
  userId: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'orders'), {
    mealId: params.meal.id,
    restaurantId: params.meal.restaurantId,
    users: [params.userId],
    usersCount: 1,
    status: 'waiting',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function matchOrder(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'matched',
    matchedAt: serverTimestamp(),
  });
}

export async function joinOrder(params: {
  meal: MarketplaceMeal;
  userId: string;
}): Promise<string> {
  const waitingQ = query(
    collection(db, 'orders'),
    where('mealId', '==', params.meal.id),
    where('restaurantId', '==', params.meal.restaurantId),
    where('status', '==', 'waiting'),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  const existing = await getDocs(waitingQ);
  const docSnap = existing.docs[0];
  if (!docSnap) {
    return createOrder({ meal: params.meal, userId: params.userId });
  }

  const orderRef = doc(db, 'orders', docSnap.id);
  await runTransaction(db, async (tx) => {
    const live = await tx.get(orderRef);
    if (!live.exists()) throw new Error('Order not found');
    const d = live.data() as Record<string, unknown>;
    const users = Array.isArray(d.users)
      ? d.users.filter((x): x is string => typeof x === 'string')
      : [];
    if (users.includes(params.userId)) return;

    const nextCount = users.length + 1;
    const updates: Record<string, unknown> = {
      users: arrayUnion(params.userId),
      usersCount: nextCount,
    };
    if (nextCount >= params.meal.threshold) {
      updates.status = 'matched';
      updates.matchedAt = serverTimestamp();
    }
    tx.update(orderRef, updates);
  });

  return docSnap.id;
}

export async function simulateCheckout(orderId: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'completed',
    completedAt: serverTimestamp(),
  });
}
