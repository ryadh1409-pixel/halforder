import { auth, db } from '@/services/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

export type HostRestaurant = {
  id: string;
  name: string;
  location: string;
  ownerId: string;
  isOpen?: boolean;
  stripeAccountId?: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
};

export type HostMeal = {
  id: string;
  restaurantId: string;
  name: string;
  fullPrice: number;
  sharedPrice: number;
  threshold: number;
  isActive: boolean;
};

export type HostOrder = {
  id: string;
  mealId: string;
  restaurantId: string;
  usersCount: number;
  status: 'waiting' | 'matched' | 'completed';
  createdAt?: unknown;
};

export function getCurrentHostId(): string | null {
  return auth.currentUser?.uid ?? null;
}

export function subscribeHostRestaurant(
  ownerId: string,
  onData: (restaurant: HostRestaurant | null) => void,
): Unsubscribe {
  const q = query(collection(db, 'restaurants'), where('ownerId', '==', ownerId));
  return onSnapshot(q, (snap) => {
    const first = snap.docs[0];
    if (!first) {
      onData(null);
      return;
    }
    const d = first.data() as Record<string, unknown>;
    onData({
      id: first.id,
      name: typeof d.name === 'string' ? d.name : 'My Restaurant',
      location: typeof d.location === 'string' ? d.location : 'Unknown location',
      ownerId,
      isOpen: d.isOpen !== false,
      stripeAccountId:
        typeof d.stripeAccountId === 'string' ? d.stripeAccountId : null,
      chargesEnabled: d.chargesEnabled === true,
      payoutsEnabled: d.payoutsEnabled === true,
    });
  });
}

export function subscribeRestaurantMeals(
  restaurantId: string,
  onData: (meals: HostMeal[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'meals'), where('restaurantId', '==', restaurantId));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((m) => {
      const d = m.data() as Record<string, unknown>;
      return {
        id: m.id,
        restaurantId,
        name: typeof d.name === 'string' ? d.name : 'Meal',
        fullPrice: typeof d.fullPrice === 'number' ? d.fullPrice : 0,
        sharedPrice: typeof d.sharedPrice === 'number' ? d.sharedPrice : 0,
        threshold:
          typeof d.threshold === 'number'
            ? Math.max(2, Math.min(3, d.threshold))
            : 2,
        isActive: d.isActive !== false,
      } satisfies HostMeal;
    });
    onData(rows);
  });
}

export function subscribeRestaurantOrders(
  restaurantId: string,
  onData: (orders: HostOrder[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'orders'),
    where('restaurantId', '==', restaurantId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((o) => {
      const d = o.data() as Record<string, unknown>;
      const statusRaw = typeof d.status === 'string' ? d.status : 'waiting';
      const status = ['waiting', 'matched', 'completed'].includes(statusRaw)
        ? (statusRaw as HostOrder['status'])
        : 'waiting';
      return {
        id: o.id,
        mealId: typeof d.mealId === 'string' ? d.mealId : '',
        restaurantId,
        usersCount: typeof d.usersCount === 'number' ? d.usersCount : 0,
        status,
        createdAt: d.createdAt,
      } satisfies HostOrder;
    });
    onData(rows);
  });
}

export async function saveMeal(input: {
  mealId?: string | null;
  restaurantId: string;
  name: string;
  fullPrice: number;
  sharedPrice: number;
  threshold: number;
}): Promise<void> {
  const payload = {
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    fullPrice: input.fullPrice,
    sharedPrice: input.sharedPrice,
    threshold: Math.max(2, Math.min(3, input.threshold)),
    isActive: true,
    createdAt: serverTimestamp(),
  };
  if (input.mealId) {
    await setDoc(doc(db, 'meals', input.mealId), payload, { merge: true });
    return;
  }
  await addDoc(collection(db, 'meals'), payload);
}

export async function setMealActive(mealId: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, 'meals', mealId), { isActive });
}

export async function removeMeal(mealId: string): Promise<void> {
  await deleteDoc(doc(db, 'meals', mealId));
}

export async function setRestaurantOpen(restaurantId: string, isOpen: boolean): Promise<void> {
  await updateDoc(doc(db, 'restaurants', restaurantId), { isOpen });
}

type ConnectAccountResponse = {
  accountId: string;
};

type AccountLinkResponse = {
  url: string;
};

type RefreshStatusResponse = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export async function createRestaurantConnectedAccount(restaurantId: string): Promise<string> {
  const callable = httpsCallable<
    { restaurantId: string },
    ConnectAccountResponse
  >(getFunctions(), 'createConnectedAccount');
  const result = await callable({ restaurantId });
  return result.data.accountId;
}

export async function createRestaurantOnboardingLink(restaurantId: string): Promise<string> {
  const callable = httpsCallable<
    { restaurantId: string },
    AccountLinkResponse
  >(getFunctions(), 'createAccountLink');
  const result = await callable({ restaurantId });
  return result.data.url;
}

export async function refreshRestaurantConnectStatus(restaurantId: string): Promise<RefreshStatusResponse> {
  const callable = httpsCallable<
    { restaurantId: string },
    RefreshStatusResponse
  >(getFunctions(), 'refreshConnectedAccountStatus');
  const result = await callable({ restaurantId });
  return result.data;
}
