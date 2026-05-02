import { db } from './firebase';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * Order chat initializer.
 *
 * Order chat lives exclusively under:
 * `orders/{orderId}/messages`
 *
 * This function intentionally depends on `orderId` only (no `participants`
 * parameter) and lets Firestore security rules enforce membership.
 */
export async function ensureOrderChatInitialized(
  orderId: string,
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) return;

  const existingQ = query(
    collection(db, 'orders', trimmed, 'messages'),
    limit(1),
  );
  const existing = await getDocs(existingQ);
  if (!existing.empty) return;

  await addDoc(collection(db, 'orders', trimmed, 'messages'), {
    text: 'You both joined this order 🍕',
    senderId: 'system',
    senderName: 'System',
    type: 'system',
    createdAt: serverTimestamp(),
  });
}
