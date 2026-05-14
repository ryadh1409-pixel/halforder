import { auth, db } from './firebase';
import { FIRESTORE_COLLECTIONS } from './firestorePaths';
import { logFirestoreQuery, shouldLogFirestoreQueries } from './firestoreQueryLog';
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

/**
 * Blocks a user for the signed-in user (or explicit `blockerId`).
 * Writes:
 * - `users/{blocker}/blockedUsers/{blocked}` (subcollection)
 * - `users/{blocker}.blockedUsers` array (for quick checks + legacy rules)
 */
export async function blockUser(
  blockedUserId: string,
  blockerId?: string,
): Promise<void> {
  const currentUid = blockerId ?? auth.currentUser?.uid ?? null;
  if (!currentUid) {
    throw new Error('You must be signed in to block users.');
  }
  if (!blockedUserId) {
    throw new Error('Invalid block target.');
  }
  if (currentUid === blockedUserId) {
    throw new Error('You cannot block yourself.');
  }

  const userRef = doc(db, 'users', currentUid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? userSnap.data()?.blockedUsers : null;
  const blockedUsers = Array.isArray(existing) ? existing : [];
  if (blockedUsers.includes(blockedUserId)) {
    await setDoc(
      doc(db, 'users', currentUid, 'blockedUsers', blockedUserId),
      {
        blockedUserId,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  await setDoc(
    doc(db, 'users', currentUid, 'blockedUsers', blockedUserId),
    {
      blockedUserId,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (userSnap.exists()) {
    await updateDoc(userRef, {
      blockedUsers: arrayUnion(blockedUserId),
    });
  } else {
    await setDoc(
      userRef,
      {
        blockedUsers: [blockedUserId],
      },
      { merge: true },
    );
  }
}

/** Removes block from subcollection and parent array. */
export async function unblockBlockedUser(
  blockedUserId: string,
  blockerId?: string,
): Promise<void> {
  const currentUid = blockerId ?? auth.currentUser?.uid ?? null;
  if (!currentUid || !blockedUserId) return;

  const userRef = doc(db, 'users', currentUid);
  try {
    await deleteDoc(doc(db, 'users', currentUid, 'blockedUsers', blockedUserId));
  } catch {
    /* missing doc */
  }
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    await updateDoc(userRef, {
      blockedUsers: arrayRemove(blockedUserId),
    });
  }
}

/**
 * True when either user blocked the other (array + `blocks` collection +
 * subcollection on either side).
 */
export async function isUserBlocked(
  currentUserId: string,
  otherUserId: string,
): Promise<boolean> {
  if (!currentUserId || !otherUserId) return false;
  if (currentUserId === otherUserId) return false;

  const [meSnap, otherSnap, subMe, subOther] = await Promise.all([
    getDoc(doc(db, 'users', currentUserId)),
    getDoc(doc(db, 'users', otherUserId)),
    getDoc(
      doc(db, 'users', currentUserId, 'blockedUsers', otherUserId),
    ),
    getDoc(
      doc(db, 'users', otherUserId, 'blockedUsers', currentUserId),
    ),
  ]);

  const myBlocked = meSnap.exists() ? meSnap.data()?.blockedUsers : [];
  const otherBlocked = otherSnap.exists() ? otherSnap.data()?.blockedUsers : [];
  const myBlockedList = Array.isArray(myBlocked) ? myBlocked : [];
  const otherBlockedList = Array.isArray(otherBlocked) ? otherBlocked : [];

  if (myBlockedList.includes(otherUserId) || otherBlockedList.includes(currentUserId)) {
    return true;
  }
  if (subMe.exists() || subOther.exists()) {
    return true;
  }

  const [b1, b2] = await Promise.all([
    getDocs(
      query(
        collection(db, 'blocks'),
        where('blockerId', '==', currentUserId),
        where('blockedUserId', '==', otherUserId),
      ),
    ),
    getDocs(
      query(
        collection(db, 'blocks'),
        where('blockerId', '==', otherUserId),
        where('blockedUserId', '==', currentUserId),
      ),
    ),
  ]);
  return !b1.empty || !b2.empty;
}

/**
 * All user IDs this account hides (blocked + users who blocked this account).
 * Uses only the signed-in user's `users/{uid}` doc, `blockedUsers` subcollection,
 * and `blocks` docs — avoids listing other users' `users/*` documents (disallowed by rules).
 */
export async function getHiddenUserIds(currentUserId: string): Promise<Set<string>> {
  if (!currentUserId) return new Set<string>();

  if (shouldLogFirestoreQueries()) {
    logFirestoreQuery('block.getHiddenUserIds', {
      collections: [
        `${FIRESTORE_COLLECTIONS.users}/${currentUserId}`,
        `users/${currentUserId}/blockedUsers`,
        FIRESTORE_COLLECTIONS.blocks,
      ],
      constraints: {
        blocksQueries: ['blockerId == uid', 'blockedUserId == uid'],
      },
    });
  }

  const meRef = doc(db, 'users', currentUserId);
  const [meSnap, subSnap, blocksAsBlocker, blocksAsBlocked] = await Promise.all([
    getDoc(meRef),
    getDocs(collection(db, 'users', currentUserId, 'blockedUsers')),
    getDocs(query(collection(db, 'blocks'), where('blockerId', '==', currentUserId))),
    getDocs(query(collection(db, 'blocks'), where('blockedUserId', '==', currentUserId))),
  ]);

  const ids = new Set<string>();
  const mine = meSnap.exists() ? meSnap.data()?.blockedUsers : [];
  if (Array.isArray(mine)) {
    mine.forEach((id) => {
      if (typeof id === 'string' && id) ids.add(id);
    });
  }
  subSnap.docs.forEach((d) => {
    const bid = typeof d.data()?.blockedUserId === 'string' ? d.data()?.blockedUserId : d.id;
    if (typeof bid === 'string' && bid) ids.add(bid);
  });
  blocksAsBlocker.docs.forEach((d) => {
    const other = d.data()?.blockedUserId;
    if (typeof other === 'string' && other) ids.add(other);
  });
  blocksAsBlocked.docs.forEach((d) => {
    const other = d.data()?.blockerId;
    if (typeof other === 'string' && other) ids.add(other);
  });
  return ids;
}
