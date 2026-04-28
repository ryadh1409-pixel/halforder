import { auth, db } from '@/services/firebase';
import type { BlockFilterCurrentUser } from '@/utils/filter';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

export type { BlockFilterCurrentUser } from '@/utils/filter';

export async function blockUser(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  const currentUid = blockerId || auth.currentUser?.uid;
  if (!currentUid || !blockedUserId) throw new Error('Invalid block target.');
  if (currentUid === blockedUserId)
    throw new Error('You cannot block yourself.');

  const userRef = doc(db, 'users', currentUid);
  await setDoc(
    doc(db, 'users', currentUid, 'blockedUsers', blockedUserId),
    {
      blockedUserId,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    await updateDoc(userRef, { blockedUsers: arrayUnion(blockedUserId) });
  } else {
    await setDoc(userRef, { blockedUsers: [blockedUserId] }, { merge: true });
  }

  const existing = await getDocs(
    query(
      collection(db, 'blocks'),
      where('blockerId', '==', currentUid),
      where('blockedUserId', '==', blockedUserId),
    ),
  );
  if (existing.empty) {
    await setDoc(doc(collection(db, 'blocks')), {
      blockerId: currentUid,
      blockedUserId,
      createdAt: serverTimestamp(),
    });
  }
}

export async function unblockUser(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  const currentUid = blockerId || auth.currentUser?.uid;
  if (!currentUid || !blockedUserId) return;
  await deleteDoc(
    doc(db, 'users', currentUid, 'blockedUsers', blockedUserId),
  ).catch(() => {});
  await updateDoc(doc(db, 'users', currentUid), {
    blockedUsers: arrayRemove(blockedUserId),
  }).catch(() => {});
  const legacySnap = await getDocs(
    query(
      collection(db, 'blocks'),
      where('blockerId', '==', currentUid),
      where('blockedUserId', '==', blockedUserId),
    ),
  );
  await Promise.all(legacySnap.docs.map((d) => deleteDoc(d.ref)));
}

export function isUserBlocked(
  currentUser: BlockFilterCurrentUser,
  targetUserId: string,
): boolean;
export function isUserBlocked(
  currentUserId: string,
  targetUserId: string,
): Promise<boolean>;
export function isUserBlocked(
  currentUser: BlockFilterCurrentUser | string,
  targetUserId: string,
): boolean | Promise<boolean> {
  if (typeof currentUser !== 'string') {
    if (!targetUserId) return false;
    if (currentUser.uid && currentUser.uid === targetUserId) return false;
    return currentUser.hiddenUserIds.has(targetUserId);
  }
  return hasBlockBetween(currentUser, targetUserId);
}

export async function hasBlockBetween(
  userA: string,
  userB: string,
): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  const [meSnap, otherSnap, subMe, subOther, legacyA, legacyB] =
    await Promise.all([
      getDoc(doc(db, 'users', userA)),
      getDoc(doc(db, 'users', userB)),
      getDoc(doc(db, 'users', userA, 'blockedUsers', userB)),
      getDoc(doc(db, 'users', userB, 'blockedUsers', userA)),
      getDocs(
        query(
          collection(db, 'blocks'),
          where('blockerId', '==', userA),
          where('blockedUserId', '==', userB),
        ),
      ),
      getDocs(
        query(
          collection(db, 'blocks'),
          where('blockerId', '==', userB),
          where('blockedUserId', '==', userA),
        ),
      ),
    ]);

  const myBlocked = meSnap.exists() ? meSnap.data()?.blockedUsers : [];
  const otherBlocked = otherSnap.exists() ? otherSnap.data()?.blockedUsers : [];
  if (Array.isArray(myBlocked) && myBlocked.includes(userB)) return true;
  if (Array.isArray(otherBlocked) && otherBlocked.includes(userA)) return true;
  if (subMe.exists() || subOther.exists()) return true;
  return !legacyA.empty || !legacyB.empty;
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
      typeof data?.blockedUserId === 'string' ? data.blockedUserId : d.id;
    if (id) ids.add(id);
  });
  legacySnap.docs.forEach((d) => {
    const id = d.data()?.blockedUserId;
    if (typeof id === 'string' && id) ids.add(id);
  });
  return [...ids];
}

export async function getHiddenUserIds(
  currentUserId: string,
): Promise<Set<string>> {
  if (!currentUserId) return new Set();
  const [meSnap, blockersSnap, subSnap] = await Promise.all([
    getDoc(doc(db, 'users', currentUserId)),
    getDocs(
      query(
        collection(db, 'users'),
        where('blockedUsers', 'array-contains', currentUserId),
      ),
    ),
    getDocs(collection(db, 'users', currentUserId, 'blockedUsers')),
  ]);
  const ids = new Set<string>();
  const mine = meSnap.exists() ? meSnap.data()?.blockedUsers : [];
  if (Array.isArray(mine)) {
    mine.forEach((id) => {
      if (typeof id === 'string' && id) ids.add(id);
    });
  }
  subSnap.docs.forEach((d) => {
    const bid =
      typeof d.data()?.blockedUserId === 'string'
        ? d.data()?.blockedUserId
        : d.id;
    if (bid) ids.add(bid);
  });
  blockersSnap.docs.forEach((d) => ids.add(d.id));
  return ids;
}
