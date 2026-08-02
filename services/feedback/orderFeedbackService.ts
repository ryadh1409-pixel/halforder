import { db } from '@/services/firebase';
import type { OrderFeedbackPayload } from '@/components/feedback/OrderFeedbackModal';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

export type OrderFeedbackDoc = OrderFeedbackPayload & {
  /** matchId for HalfOrder/Swipe orders, orderId for FullOrder/Marketplace orders */
  orderId: string;
  /** 'halforder' | 'fullorder' */
  orderType: 'halforder' | 'fullorder';
  userId: string;
  restaurantName: string | null;
  submittedAt: unknown;
};

/**
 * Save order feedback to Firestore.
 * Collection: orderFeedback / {orderId}_{userId}
 */
export async function submitOrderFeedback(
  orderId: string,
  userId: string,
  restaurantName: string | null,
  payload: OrderFeedbackPayload,
  orderType: 'halforder' | 'fullorder' = 'halforder',
): Promise<void> {
  const docId = `${orderId}_${userId}`;
  await setDoc(doc(db, 'orderFeedback', docId), {
    orderId,
    orderType,
    userId,
    restaurantName: restaurantName ?? null,
    orderRating: payload.orderRating,
    restaurantRating: payload.restaurantRating,
    driverRating: payload.driverRating ?? null,
    comment: payload.comment,
    submittedAt: serverTimestamp(),
  });
}

/**
 * Returns true if the user has already submitted feedback for this order.
 */
export async function hasSubmittedFeedback(
  orderId: string,
  userId: string,
): Promise<boolean> {
  const docId = `${orderId}_${userId}`;
  const snap = await getDoc(doc(db, 'orderFeedback', docId));
  return snap.exists();
}
