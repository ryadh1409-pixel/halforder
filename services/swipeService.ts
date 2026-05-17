import { auth, db } from '@/services/firebase';
import type { SwipeDirection } from '@/types/swipe';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

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
}): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid || input.participantIds.length < 2) return null;
  const roomId = `${input.orderId}_${[...input.participantIds].sort().join('_')}`;
  try {
    await setDoc(
      doc(db, 'sharedOrders', roomId),
      {
        orderId: input.orderId,
        participantIds: input.participantIds,
        foodTitle: input.foodTitle,
        splitPrice: input.splitPrice,
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
