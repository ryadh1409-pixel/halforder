import { db } from './firebase';
import {
  logBlockQueryFailed,
  logBlockQueryStart,
  logBlockQuerySuccess,
} from './blockQueryLog';
import {
  blockUser as persistBlockUser,
  isUserBlocked,
  unblockBlockedUser,
} from './block';
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

/**
 * Legacy `blocks` collection mirror (optional). Primary block state lives in
 * `users/{blocker}/blockedUsers/{blocked}`.
 */
async function mirrorLegacyBlockDoc(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  const existing = query(
    collection(db, 'blocks'),
    where('blockerId', '==', blockerId),
    where('blockedUserId', '==', blockedUserId),
  );
  const mirrorPath = 'blocks(mirror)';
  logBlockQueryStart(mirrorPath, 'getDocs');
  const existingSnap = await getDocs(existing);
  if (!existingSnap.empty) {
    logBlockQuerySuccess(mirrorPath, 'getDocs(skip)');
    return;
  }
  logBlockQuerySuccess(mirrorPath, 'getDocs');

  logBlockQueryStart(mirrorPath, 'addDoc');
  await addDoc(collection(db, 'blocks'), {
    blockerId,
    blockedUserId,
    createdAt: serverTimestamp(),
  });
  logBlockQuerySuccess(mirrorPath, 'addDoc');
}

/** Primary API: `users/{blocker}/blockedUsers/{blocked}` subcollection. */
export async function blockUser(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  if (!blockerId || !blockedUserId) throw new Error('Invalid user IDs.');
  if (blockerId === blockedUserId) throw new Error('You cannot block yourself.');

  await persistBlockUser(blockedUserId, blockerId);
  await mirrorLegacyBlockDoc(blockerId, blockedUserId);
}

export async function hasBlockBetween(
  userA: string,
  userB: string,
): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  return isUserBlocked(userA, userB);
}

export async function getBlockedUsersByBlocker(
  blockerId: string,
): Promise<string[]> {
  if (!blockerId) return [];

  const subPath = `users/${blockerId}/blockedUsers`;
  const blocksPath = 'blocks(blockerId==uid)';
  logBlockQueryStart(subPath, 'getDocs');
  logBlockQueryStart(blocksPath, 'getDocs');
  let subSnap;
  let legacySnap;
  try {
    [subSnap, legacySnap] = await Promise.all([
      getDocs(collection(db, 'users', blockerId, 'blockedUsers')),
      getDocs(
        query(collection(db, 'blocks'), where('blockerId', '==', blockerId)),
      ),
    ]);
    logBlockQuerySuccess(subPath, 'getDocs');
    logBlockQuerySuccess(blocksPath, 'getDocs');
  } catch (error) {
    logBlockQueryFailed(subPath, 'getDocs', error);
    throw error;
  }

  const ids = new Set<string>();
  subSnap.docs.forEach((d) => {
    const data = d.data();
    const id =
      typeof data?.blockedUserId === 'string' && data.blockedUserId
        ? data.blockedUserId
        : d.id;
    if (id) ids.add(id);
  });
  legacySnap.docs.forEach((d) => {
    const id = String(d.data()?.blockedUserId ?? '');
    if (id) ids.add(id);
  });
  return [...ids];
}

export async function unblockUser(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  if (!blockerId || !blockedUserId) return;
  await unblockBlockedUser(blockedUserId, blockerId);
  const legacyPath = 'blocks(unblock cleanup)';
  logBlockQueryStart(legacyPath, 'getDocs');
  const q = query(
    collection(db, 'blocks'),
    where('blockerId', '==', blockerId),
    where('blockedUserId', '==', blockedUserId),
  );
  try {
    const snap = await getDocs(q);
    logBlockQuerySuccess(legacyPath, 'getDocs');
    if (snap.docs.length > 0) {
      logBlockQueryStart(legacyPath, 'deleteDoc');
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      logBlockQuerySuccess(legacyPath, 'deleteDoc');
    }
  } catch (error) {
    logBlockQueryFailed(legacyPath, 'getDocs', error);
    throw error;
  }
}
