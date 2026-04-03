import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

export async function blockUser(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  if (!blockerId || !blockedUserId) throw new Error('Invalid user IDs.');
  if (blockerId === blockedUserId) throw new Error('You cannot block yourself.');

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

export async function hasBlockBetween(
  userA: string,
  userB: string,
): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;

  const [snapA, snapB] = await Promise.all([
    getDoc(doc(db, 'users', userA)),
    getDoc(doc(db, 'users', userB)),
  ]);
  const aBlocked = snapA.exists() ? snapA.data()?.blockedUsers : [];
  const bBlocked = snapB.exists() ? snapB.data()?.blockedUsers : [];
  const listA = Array.isArray(aBlocked) ? aBlocked : [];
  const listB = Array.isArray(bBlocked) ? bBlocked : [];
  if (listA.includes(userB) || listB.includes(userA)) return true;

  const q1 = query(
    collection(db, 'blocks'),
    where('blockerId', '==', userA),
    where('blockedUserId', '==', userB),
  );
  const q2 = query(
    collection(db, 'blocks'),
    where('blockerId', '==', userB),
    where('blockedUserId', '==', userA),
  );
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  return !s1.empty || !s2.empty;
}

export async function getBlockedUsersByBlocker(
  blockerId: string,
): Promise<string[]> {
  if (!blockerId) return [];
  const q = query(
    collection(db, 'blocks'),
    where('blockerId', '==', blockerId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => String(d.data()?.blockedUserId ?? ''))
    .filter(Boolean);
}

export async function unblockUser(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  if (!blockerId || !blockedUserId) return;
  const q = query(
    collection(db, 'blocks'),
    where('blockerId', '==', blockerId),
    where('blockedUserId', '==', blockedUserId),
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'blocks', d.id))));
}
