import { auth, db } from '@/services/firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

/**
 * User IDs the current user should not see in discovery (blocked either direction).
 */
export function useHiddenUserIds(): Set<string> {
  const uid = auth.currentUser?.uid ?? null;
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [blockerIds, setBlockerIds] = useState<string[]>([]);

  useEffect(() => {
    if (!uid) {
      setBlockedIds([]);
      setBlockerIds([]);
      return;
    }
    const myRef = doc(db, 'users', uid);
    const q2 = query(
      collection(db, 'users'),
      where('blockedUsers', 'array-contains', uid),
    );
    const unsub1 = onSnapshot(myRef, (snap) => {
      if (!snap.exists()) {
        setBlockedIds([]);
        return;
      }
      const list = snap.data()?.blockedUsers;
      setBlockedIds(Array.isArray(list) ? list.filter(Boolean) : []);
    });
    const unsub2 = onSnapshot(
      q2,
      (snap) => {
        setBlockerIds(
          snap.docs.map((d) => String(d.id ?? '')).filter(Boolean),
        );
      },
      () => setBlockerIds([]),
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [uid]);

  return useMemo(
    () => new Set([...blockedIds, ...blockerIds]),
    [blockedIds, blockerIds],
  );
}

/**
 * Real-time: true if this peer is hidden (you blocked them or they blocked you).
 */
export function useIsPeerHidden(peerId: string | null | undefined): boolean {
  const hidden = useHiddenUserIds();
  return Boolean(peerId && hidden.has(peerId));
}
