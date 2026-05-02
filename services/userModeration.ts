import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

function readIsFlagged(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.isFlagged === true) return true;
  /** Legacy field from earlier builds */
  if (data.flagged === true) return true;
  return false;
}

/** Set server-side when report count ≥ 3 (see Cloud Function `refreshUserDerivedFields`). */
export async function isUserFlagged(uid: string): Promise<boolean> {
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return false;
  return readIsFlagged(snap.data() as Record<string, unknown>);
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
