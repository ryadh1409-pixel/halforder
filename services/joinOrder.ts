/**
 * Join `orders/{orderId}` using `participants` + `joinedAtMap`, or HalfOrder `users` array.
 */
import {
  arrayUnion,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { isUserBanned } from '@/services/adminGuard';
import { hasBlockBetween } from '@/services/blocks';
import {
  ensureHalfOrderChat,
  postHalfOrderChatSystemMessage,
} from '@/services/halfOrderChat';
import { auth, db } from '@/services/firebase';
import { trySendPairJoinExpoPush } from '@/services/orderPairPushNotify';
import { joinOrderWithParticipantRecord } from '@/services/orderLifecycle';

function normalizeOrderUsersArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

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

/**
 * Join a HalfOrder (`users` membership, linked to food cards with `cardId`).
 */
export async function joinHalfOrderByOrderId(orderId: string): Promise<{
  alreadyJoined: boolean;
  justBecamePair: boolean;
}> {
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
  const usersFirst = normalizeOrderUsersArray(preData.users);
  if (usersFirst.length === 0) {
    throw new Error('Use the standard join flow for this order.');
  }

  const createdBy =
    typeof preData.createdBy === 'string'
      ? preData.createdBy
      : usersFirst[0] ?? '';
  if (createdBy && createdBy !== uid) {
    if (await hasBlockBetween(uid, createdBy)) {
      throw new Error('You cannot join this order due to a block.');
    }
  }

  const txResult = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists()) throw new Error('Order no longer exists.');
    const d = snap.data() as Record<string, unknown>;
    const users = normalizeOrderUsersArray(d.users);
    const maxPeople =
      typeof d.maxUsers === 'number' && d.maxUsers > 0 ? d.maxUsers : 2;
    if (users.includes(uid)) {
      return { tag: 'already' as const, priorCount: users.length };
    }
    if (users.length >= maxPeople) {
      throw new Error('Order is full.');
    }
    transaction.update(orderRef, { users: arrayUnion(uid) });
    return { tag: 'added' as const, priorCount: users.length };
  });

  const postSnap = await getDoc(orderRef);
  const finalUsers = normalizeOrderUsersArray(postSnap.data()?.users);
  await ensureHalfOrderChat(trimmedId, finalUsers);

  let justBecamePair = false;
  if (txResult.tag === 'added' && txResult.priorCount === 1 && finalUsers.length >= 2) {
    justBecamePair = true;
    await postHalfOrderChatSystemMessage(
      trimmedId,
      'Someone joined your order!',
    );
    void trySendPairJoinExpoPush(trimmedId, uid);
  }

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

  return {
    alreadyJoined: txResult.tag === 'already',
    justBecamePair,
  };
}
