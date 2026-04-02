/**
 * Join `orders/{orderId}` using normalized `participants: string[]` + `joinedAtMap`.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { isUserBanned } from '@/services/adminGuard';
import { hasBlockBetween } from '@/services/blocks';
import { auth, db } from '@/services/firebase';
import { joinOrderWithParticipantRecord } from '@/services/orderLifecycle';

/**
 * Join the current user to `orders/{orderId}`.
 * @throws Error with a user-facing message on failure
 */
export async function joinOrder(orderId: string): Promise<void> {
  const trimmedId = orderId?.trim();
  if (!trimmedId) {
    throw new Error('Invalid order.');
  }

  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error('You must be signed in to join an order.');
  }
  const uid = user.uid;

  if (await isUserBanned(uid)) {
    throw new Error('Your account has been restricted. You cannot join orders.');
  }

  const orderRef = doc(db, 'orders', trimmedId);
  const preSnap = await getDoc(orderRef);
  if (!preSnap.exists()) {
    throw new Error('Order not found.');
  }

  const preData = preSnap.data() as Record<string, unknown>;
  const createdBy = typeof preData.createdBy === 'string' ? preData.createdBy : '';
  if (createdBy && createdBy !== uid) {
    if (await hasBlockBetween(uid, createdBy)) {
      throw new Error('You cannot join this order due to a block.');
    }
  }

  console.log('UID:', uid);
  console.log('ORDER PARTICIPANTS:', preData.participants);

  await joinOrderWithParticipantRecord(db, trimmedId, uid, {}, {
    requireOpenForJoin: false,
  });

  await setDoc(
    doc(db, 'orders', trimmedId, 'joins', uid),
    { userId: uid, joinedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});

  await setDoc(
    doc(db, 'users', uid, 'joinedOrders', trimmedId),
    { orderId: trimmedId, joinedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});

  console.info('[joinOrder] success', { orderId: trimmedId, uid });
}
