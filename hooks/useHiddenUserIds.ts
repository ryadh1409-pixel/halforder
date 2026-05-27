import { auth, db } from '../services/firebase';
import {
  beginFirestoreQuery,
  logFirestoreQueryFailed,
} from '../services/firestoreQueryDiagnostics';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

/**
 * User IDs the current user should not see in discovery.
 * Uses `users/{uid}.blockedUsers` only (users you blocked).
 *
 * Reverse blocks (users who blocked you) are not loaded — listing
 * `users` where `blockedUsers array-contains` the current uid is not
 * allowed for privacy/security reasons.
 *
 * @param enabled When false, skips Firestore listeners (e.g. explore tab not focused).
 */
export function useHiddenUserIds(enabled: boolean = true): Set<string> {
  const currentUser = auth.currentUser;
  const uid =
    currentUser?.uid && !currentUser.isAnonymous ? currentUser.uid : null;
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || !uid) {
      setBlockedIds([]);
      return;
    }
    const myRef = doc(db, 'users', uid);
    const promiseIdMy = beginFirestoreQuery({
      file: 'hooks/useHiddenUserIds.ts',
      listener: 'useHiddenUserIds.usersDoc',
      collection: `users/${uid}`,
      filters: { op: 'onSnapshot', fields: ['blockedUsers'] },
    });
    const unsub = onSnapshot(
      myRef,
      (snap) => {
        if (!snap.exists()) {
          setBlockedIds([]);
          return;
        }
        const list = snap.data()?.blockedUsers;
        setBlockedIds(Array.isArray(list) ? list.filter(Boolean) : []);
      },
      (err) => {
        logFirestoreQueryFailed(promiseIdMy, 'useHiddenUserIds.usersDoc', err);
        setBlockedIds([]);
      },
    );
    return () => unsub();
  }, [uid, enabled]);

  /** Who blocked me — disabled; cannot scan `users` collection (privacy). */
  const blockerIds: string[] = [];

  return useMemo(
    () => new Set([...blockedIds, ...blockerIds]),
    [blockedIds],
  );
}

/**
 * Real-time: true if this peer is hidden (you blocked them).
 */
export function useIsPeerHidden(peerId: string | null | undefined): boolean {
  const hidden = useHiddenUserIds();
  return Boolean(peerId && hidden.has(peerId));
}
