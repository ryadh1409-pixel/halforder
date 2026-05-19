import { auth, db } from '@/services/firebase';
import type { SwipeDirection } from '@/types/swipe';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

export type RecordSwipeInput = {
  orderId: string;
  foodId: string;
  restaurantId: string;
  direction: SwipeDirection;
};

/**
 * Persists a swipe gesture to `swipes/` for analytics + match discovery.
 * Match pairing still flows through `orders.usersAccepted` + `matches/`.
 */
export async function recordSwipe(
  input: RecordSwipeInput,
): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  if (__DEV__) {
    console.log('[swipeService] recordSwipe', { ...input, userId: uid });
  }

  try {
    const ref = await addDoc(collection(db, 'swipes'), {
      userId: uid,
      orderId: input.orderId,
      foodId: input.foodId,
      restaurantId: input.restaurantId,
      direction: input.direction,
      liked: input.direction === 'like',
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    if (__DEV__) {
      console.log('[swipeService] wrote', { path: `swipes/${ref.id}` });
    }
    return ref.id;
  } catch (e) {
    if (__DEV__) {
      console.warn('[swipeService] recordSwipe failed', e);
    }
    return null;
  }
}

/** Creates a shared checkout room after two users match on the same food. */
export async function createSharedOrderRoom(input: {
  orderId: string;
  participantIds: string[];
  foodTitle: string;
  splitPrice: number;
  matchId?: string;
  restaurantName?: string;
  heroImageUri?: string;
}): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  const participantIds = Array.from(new Set(input.participantIds))
    .filter(Boolean)
    .sort();
  if (!uid || participantIds.length < 2 || !participantIds.includes(uid)) {
    return null;
  }

  const roomId =
    input.matchId ?? `${input.orderId}_${participantIds.sort().join('_')}`;
  const itemTotal =
    Math.round(input.splitPrice * participantIds.length * 100) / 100;

  try {
    await setDoc(
      doc(db, 'sharedOrders', roomId),
      {
        orderId: input.orderId,
        matchId: input.matchId ?? roomId,
        participantIds,
        foodTitle: input.foodTitle,
        restaurantName: input.restaurantName ?? 'Nearby restaurant',
        heroImageUri: input.heroImageUri ?? null,
        splitPrice: input.splitPrice,
        cartSubtotal: itemTotal,
        cartItems: [
          {
            id: input.orderId,
            title: input.foodTitle,
            quantity: participantIds.length,
            pricePerPerson: input.splitPrice,
            total: itemTotal,
          },
        ],
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (__DEV__) console.log('[swipeService] sharedOrders/', roomId);
    return roomId;
  } catch (e) {
    if (__DEV__) console.warn('[swipeService] createSharedOrderRoom failed', e);
    return null;
  }
}
