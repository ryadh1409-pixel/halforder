/**
 * Block / unblock via `users/{uid}/blockedUsers/{blockedUserId}` subcollection.
 */
import { auth, db } from '../services/firebase';
import {
  blockUser as blockUserApi,
  isUserBlocked as isUserBlockedApi,
  unblockUser as unblockUserApi,
  type BlockFilterCurrentUser,
} from '../services/blockService';
import {
  logBlockQueryFailed,
  logBlockQueryStart,
  logBlockQuerySuccess,
} from '../services/blockQueryLog';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useMemo } from 'react';

import { useHiddenUserIds } from './useHiddenUserIds';

export type UseBlockResult = {
  uid: string | null;
  /** Ids you blocked (from `users/{uid}/blockedUsers/*`). */
  blockedByMeIds: string[];
  /** Users you blocked (same as subcollection snapshot; no profile-array reads). */
  hiddenUserIds: Set<string>;
  filterContext: BlockFilterCurrentUser;
  isHiddenFromMe: (targetUserId: string) => boolean;
  iBlockedThem: (targetUserId: string) => boolean;
  blockUser: (targetUserId: string) => Promise<void>;
  unblockUser: (targetUserId: string) => Promise<void>;
};

export function useBlock(): UseBlockResult {
  const currentUser = auth.currentUser;
  const uid =
    currentUser?.uid && !currentUser.isAnonymous ? currentUser.uid : null;
  const hiddenUserIds = useHiddenUserIds();
  const blockedByMeIds = useMemo(() => [...hiddenUserIds], [hiddenUserIds]);

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

/** Document-id lookup: `users/{viewer}/blockedUsers/{peerId}`. */
export async function isPeerBlockedInSubcollection(
  viewerUid: string,
  peerId: string,
): Promise<boolean> {
  if (!viewerUid || !peerId || viewerUid === peerId) return false;
  const path = `users/${viewerUid}/blockedUsers/${peerId}`;
  const operation = 'getDoc';
  logBlockQueryStart(path, operation);
  try {
    const snap = await getDoc(
      doc(db, 'users', viewerUid, 'blockedUsers', peerId),
    );
    logBlockQuerySuccess(path, operation);
    return snap.exists();
  } catch (error) {
    logBlockQueryFailed(path, operation, error);
    throw error;
  }
}
