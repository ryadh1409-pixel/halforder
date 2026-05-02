/**
 * Block / unblock: live `users/{uid}.blockedUsers` + bidirectional hide via `useHiddenUserIds`.
 */
import { auth, db } from '../services/firebase';
import {
  blockUser as blockUserApi,
  isUserBlocked as isUserBlockedApi,
  unblockUser as unblockUserApi,
  type BlockFilterCurrentUser,
} from '../services/blockService';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useHiddenUserIds } from './useHiddenUserIds';

export type UseBlockResult = {
  uid: string | null;
  /** Ids you blocked (from `users/{uid}.blockedUsers` array) — updates in real time. */
  blockedByMeIds: string[];
  /** Bidirectional: you blocked them OR they blocked you — for filtering & “cannot chat”. */
  hiddenUserIds: Set<string>;
  /** For `filterBlockedUsers` / `isUserBlocked` sync overload. */
  filterContext: BlockFilterCurrentUser;
  /** True if either side blocked (same as peer in hidden set). */
  isHiddenFromMe: (targetUserId: string) => boolean;
  /** True if **you** blocked this user (unblock available). */
  iBlockedThem: (targetUserId: string) => boolean;
  blockUser: (targetUserId: string) => Promise<void>;
  unblockUser: (targetUserId: string) => Promise<void>;
};

export function useBlock(): UseBlockResult {
  const uid = auth.currentUser?.uid ?? null;
  const hiddenUserIds = useHiddenUserIds();
  const [blockedByMeIds, setBlockedByMeIds] = useState<string[]>([]);

  useEffect(() => {
    if (!uid) {
      setBlockedByMeIds([]);
      return;
    }
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const raw = snap.data()?.blockedUsers;
        const list = Array.isArray(raw)
          ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
          : [];
        setBlockedByMeIds(list);
      },
      () => setBlockedByMeIds([]),
    );
    return () => unsub();
  }, [uid]);

  const filterContext: BlockFilterCurrentUser = useMemo(
    () => ({ uid, hiddenUserIds }),
    [uid, hiddenUserIds],
  );

  const isHiddenFromMe = useCallback(
    (targetUserId: string) => isUserBlockedApi(filterContext, targetUserId),
    [filterContext],
  );

  const iBlockedThem = useCallback(
    (targetUserId: string) => blockedByMeIds.includes(targetUserId),
    [blockedByMeIds],
  );

  const blockUser = useCallback(
    async (targetUserId: string) => {
      if (!uid) throw new Error('Not signed in');
      await blockUserApi(uid, targetUserId);
    },
    [uid],
  );

  const unblockUser = useCallback(
    async (targetUserId: string) => {
      if (!uid) throw new Error('Not signed in');
      await unblockUserApi(uid, targetUserId);
    },
    [uid],
  );

  return {
    uid,
    blockedByMeIds,
    hiddenUserIds,
    filterContext,
    isHiddenFromMe,
    iBlockedThem,
    blockUser,
    unblockUser,
  };
}
