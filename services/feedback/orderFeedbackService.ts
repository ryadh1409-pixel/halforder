import { db } from '@/services/firebase';
import type { OrderFeedbackPayload } from '@/components/feedback/OrderFeedbackModal';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

export type OrderFeedbackDoc = OrderFeedbackPayload & {
  matchId: string;
  userId: string;
  restaurantName: string | null;
  submittedAt: unknown;
};

/**
 * Save order feedback to Firestore.
 * Collection: orderFeedback / {matchId}_{userId}
 */
export async function submitOrderFeedback(
  matchId: string,
  userId: string,
  restaurantName: string | null,
  payload: OrderFeedbackPayload,
): Promise<void> {
  const docId = `${matchId}_${userId}`;
  await setDoc(doc(db, 'orderFeedback', docId), {
    matchId,
    userId,
    restaurantName: restaurantName ?? null,
    orderRating: payload.orderRating,
    restaurantRating: payload.restaurantRating,
    driverRating: payload.driverRating ?? null,
    comment: payload.comment,
    submittedAt: serverTimestamp(),
  } satisfies Omit<OrderFeedbackDoc, 'submittedAt'> & { submittedAt: unknown });
}

/**
 * Returns true if the user has already submitted feedback for this match.
 */
export async function hasSubmittedFeedback(
  matchId: string,
  userId: string,
): Promise<boolean> {
  const docId = `${matchId}_${userId}`;
  const snap = await getDoc(doc(db, 'orderFeedback', docId));
  return snap.exists();
}
