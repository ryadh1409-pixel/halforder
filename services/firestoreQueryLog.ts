import { doc, getDoc } from 'firebase/firestore';

import { app, auth, db } from './firebase';
import { FIRESTORE_COLLECTIONS } from './firestorePaths';

/** Development only — avoids noisy Firestore traces in production / TestFlight. */
export function shouldLogFirestoreQueries(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/**
 * Standard log line before Firestore reads (collection path, auth, project, optional role).
 */
export function logFirestoreQuery(
  label: string,
  details: {
    collection?: string;
    collections?: string[];
    constraints?: Record<string, unknown>;
    role?: string;
  },
): void {
  if (!shouldLogFirestoreQueries()) return;
  const u = auth.currentUser;
  console.log('[Firestore Query]', label, {
    projectId: app.options.projectId,
    uid: u?.uid ?? null,
    isAnonymous: u?.isAnonymous ?? null,
    ...details,
  });
}

/** One `users/{uid}` read for role; logged when query logging is enabled. */
export async function fetchUserRoleWithLog(uid: string | null): Promise<string> {
  if (!uid) return 'none';
  logFirestoreQuery('users.getDoc.role', {
    collection: `${FIRESTORE_COLLECTIONS.users}/${uid}`,
    constraints: { op: 'getDoc' },
  });
  try {
    const us = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid));
    return us.exists() ? String((us.data() as Record<string, unknown>).role ?? 'user') : 'no-doc';
  } catch {
    return 'error';
  }
}
