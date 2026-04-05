import { db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';

/** `users/{uid}.flagged` — set server-side after multiple reports (see Cloud Function). */
export async function isUserFlagged(uid: string): Promise<boolean> {
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return false;
  return snap.data()?.flagged === true;
}

export async function filterFlaggedUserIds(
  userIds: readonly string[],
): Promise<Set<string>> {
  const flagged = new Set<string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.all(
    unique.map(async (id) => {
      if (await isUserFlagged(id)) flagged.add(id);
    }),
  );
  return flagged;
}
