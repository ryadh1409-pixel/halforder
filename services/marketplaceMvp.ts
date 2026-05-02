import { db } from './firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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

export type MarketplaceSingleOrder = MarketplaceOrder & {
  orderMode: 'single';
};

function mapMeal(docId: string, raw: Record<string, unknown>): MarketplaceMeal {
  return {
    id: docId,
    restaurantId: typeof raw.restaurantId === 'string' ? raw.restaurantId : '',
    name: typeof raw.name === 'string' ? raw.name : 'Meal',
    fullPrice: typeof raw.fullPrice === 'number' ? raw.fullPrice : 0,
    sharedPrice: typeof raw.sharedPrice === 'number' ? raw.sharedPrice : 0,
    threshold: typeof raw.threshold === 'number' ? raw.threshold : 2,
    isActive: raw.isActive !== false,
  };
}

export function subscribeActiveMeals(
  onData: (rows: MarketplaceMeal[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'meals'),
    where('isActive', '==', true),
    orderBy('name', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => mapMeal(d.id, d.data() as Record<string, unknown>)));
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

export function subscribeMySingleOrders(
  userId: string,
  onData: (rows: MarketplaceSingleOrder[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'orders'),
    where('orderMode', '==', 'single'),
    where('users', 'array-contains', userId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const rows: MarketplaceSingleOrder[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const users = Array.isArray(data.users)
        ? data.users.filter((u): u is string => typeof u === 'string')
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
        orderMode: 'single',
      };
    });
    onData(rows);
  });
}

export async function createSingleOrder(params: {
  meal: MarketplaceMeal;
  userId: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'orders'), {
    mealId: params.meal.id,
    restaurantId: params.meal.restaurantId,
    users: [params.userId],
    usersCount: 1,
    status: 'matched',
    orderMode: 'single',
    matchThreshold: 1,
    createdAt: serverTimestamp(),
    matchedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}
