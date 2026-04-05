import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import {
  blockUser as persistBlock,
  isUserBlocked,
  unblockBlockedUser,
} from '@/services/block';

/**
 * @deprecated Prefer `block` service writing only subcollection + array.
 * Keeps `blocks` collection writes for older clients; new blocks use `blockUser` below.
 */
export async function blockUserLegacy(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  if (!blockerId || !blockedUserId) throw new Error('Invalid user IDs.');
  if (blockerId === blockedUserId) throw new Error('You cannot block yourself.');

  await persistBlock(blockedUserId, blockerId);

  const existing = query(
    collection(db, 'blocks'),
    where('blockerId', '==', blockerId),
    where('blockedUserId', '==', blockedUserId),
  );
  const existingSnap = await getDocs(existing);
  if (!existingSnap.empty) return;

  await addDoc(collection(db, 'blocks'), {
    blockerId,
    blockedUserId,
    createdAt: serverTimestamp(),
  });
}

/** Primary API: subcollection `users/{blocker}/blockedUsers/{blocked}` + parent array. */
export async function blockUser(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  await blockUserLegacy(blockerId, blockedUserId);
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

  const [subSnap, legacySnap] = await Promise.all([
    getDocs(collection(db, 'users', blockerId, 'blockedUsers')),
    getDocs(
      query(collection(db, 'blocks'), where('blockerId', '==', blockerId)),
    ),
  ]);

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
  const q = query(
    collection(db, 'blocks'),
    where('blockerId', '==', blockerId),
    where('blockedUserId', '==', blockedUserId),
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
