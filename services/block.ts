import { auth, db } from './firebase';
import { FIRESTORE_COLLECTIONS } from './firestorePaths';
import {
  logBlockQueryFailed,
  logBlockQueryStart,
  logBlockQuerySuccess,
} from './blockQueryLog';
import { logFirestoreQuery, shouldLogFirestoreQueries } from './firestoreQueryLog';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

function blockedSubcollectionPath(blockerId: string): string {
  return `users/${blockerId}/blockedUsers`;
}

function blockedDocPath(blockerId: string, blockedUserId: string): string {
  return `${blockedSubcollectionPath(blockerId)}/${blockedUserId}`;
}

/**
 * Blocks a user for the signed-in user (or explicit `blockerId`).
 * Writes only `users/{blocker}/blockedUsers/{blockedUserId}`.
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

  const path = blockedDocPath(currentUid, blockedUserId);
  const operation = 'setDoc';
  logBlockQueryStart(path, operation);
  try {
    await setDoc(
      doc(db, 'users', currentUid, 'blockedUsers', blockedUserId),
      {
        blockedUserId,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    logBlockQuerySuccess(path, operation);
  } catch (error) {
    logBlockQueryFailed(path, operation, error);
    throw error;
  }
}

/** Deletes `users/{blocker}/blockedUsers/{blockedUserId}`. */
export async function unblockBlockedUser(
  blockedUserId: string,
  blockerId?: string,
): Promise<void> {
  const currentUid = blockerId ?? auth.currentUser?.uid ?? null;
  if (!currentUid || !blockedUserId) return;

  const path = blockedDocPath(currentUid, blockedUserId);
  const operation = 'deleteDoc';
  logBlockQueryStart(path, operation);
  try {
    await deleteDoc(doc(db, 'users', currentUid, 'blockedUsers', blockedUserId));
    logBlockQuerySuccess(path, operation);
  } catch (error) {
    logBlockQueryFailed(path, operation, error);
    throw error;
  }
}

/**
 * True when either user blocked the other (subcollection docs + legacy `blocks`).
 */
export async function isUserBlocked(
  currentUserId: string,
  otherUserId: string,
): Promise<boolean> {
  if (!currentUserId || !otherUserId) return false;
  if (currentUserId === otherUserId) return false;

  const subMePath = blockedDocPath(currentUserId, otherUserId);
  logBlockQueryStart(subMePath, 'getDoc');

  let iBlockedThem = false;
  try {
    const subMe = await getDoc(
      doc(db, 'users', currentUserId, 'blockedUsers', otherUserId),
    );
    iBlockedThem = subMe.exists();
    logBlockQuerySuccess(
      subMePath,
      iBlockedThem ? 'getDoc' : 'getDoc(not-found)',
    );
  } catch (error) {
    logBlockQueryFailed(subMePath, 'getDoc', error);
    throw error;
  }

  if (iBlockedThem) {
    return true;
  }

  const blocksPath = `${FIRESTORE_COLLECTIONS.blocks}`;
  logBlockQueryStart(blocksPath, 'getDocs(blocker pair)');
  try {
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
    logBlockQuerySuccess(blocksPath, 'getDocs(blocker pair)');
    return !b1.empty || !b2.empty;
  } catch (error) {
    logBlockQueryFailed(blocksPath, 'getDocs(blocker pair)', error);
    throw error;
  }
}

/**
 * User IDs this account should hide: blocked via subcollection + legacy `blocks` only.
 * Does not read `users/{uid}.blockedUsers` array or other users' profile docs.
 */
export async function getHiddenUserIds(currentUserId: string): Promise<Set<string>> {
  if (!currentUserId) return new Set<string>();

  const subPath = blockedSubcollectionPath(currentUserId);
  if (shouldLogFirestoreQueries()) {
    logFirestoreQuery('block.getHiddenUserIds', {
      collections: [subPath, FIRESTORE_COLLECTIONS.blocks],
      constraints: {
        blocksQueries: ['blockerId == uid', 'blockedUserId == uid'],
      },
    });
  }

  logBlockQueryStart(subPath, 'getDocs');
  const ids = new Set<string>();
  try {
    const subSnap = await getDocs(
      collection(db, 'users', currentUserId, 'blockedUsers'),
    );
    logBlockQuerySuccess(subPath, 'getDocs');
    subSnap.docs.forEach((d) => {
      const bid =
        typeof d.data()?.blockedUserId === 'string' ? d.data().blockedUserId : d.id;
      if (typeof bid === 'string' && bid) ids.add(bid);
    });
  } catch (error) {
    logBlockQueryFailed(subPath, 'getDocs', error);
    throw error;
  }

  const blocksPath = FIRESTORE_COLLECTIONS.blocks;
  logBlockQueryStart(blocksPath, 'getDocs(blocker + blocked)');
  try {
    const [blocksAsBlocker, blocksAsBlocked] = await Promise.all([
      getDocs(query(collection(db, 'blocks'), where('blockerId', '==', currentUserId))),
      getDocs(
        query(collection(db, 'blocks'), where('blockedUserId', '==', currentUserId)),
      ),
    ]);
    logBlockQuerySuccess(blocksPath, 'getDocs(blocker + blocked)');
    blocksAsBlocker.docs.forEach((d) => {
      const other = d.data()?.blockedUserId;
      if (typeof other === 'string' && other) ids.add(other);
    });
    blocksAsBlocked.docs.forEach((d) => {
      const other = d.data()?.blockerId;
      if (typeof other === 'string' && other) ids.add(other);
    });
  } catch (error) {
    logBlockQueryFailed(blocksPath, 'getDocs(blocker + blocked)', error);
    throw error;
  }

  return ids;
}
