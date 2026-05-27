import { auth, db } from '../services/firebase';
import {
  logBlockQueryFailed,
  logBlockQueryStart,
  logBlockQuerySuccess,
} from '../services/blockQueryLog';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

/**
 * Bidirectional hide set without reading `users/{uid}.blockedUsers` or other users'
 * profile documents.
 *
 * - Users you blocked: `users/{uid}/blockedUsers/*`
 * - Users who blocked you: legacy `blocks` where `blockedUserId == uid` (mirrored on block)
 *
 * @param enabled When false, skips Firestore listeners (e.g. explore tab not focused).
 */
export function useHiddenUserIds(enabled: boolean = true): Set<string> {
  const currentUser = auth.currentUser;
  const uid =
    currentUser?.uid && !currentUser.isAnonymous ? currentUser.uid : null;
  const [blockedByMe, setBlockedByMe] = useState<string[]>([]);
  const [blockedMe, setBlockedMe] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || !uid) {
      setBlockedByMe([]);
      setBlockedMe([]);
      return;
    }

    const subPath = `users/${uid}/blockedUsers`;
    const subOp = 'onSnapshot';
    logBlockQueryStart(subPath, subOp);

    const unsubSub = onSnapshot(
      collection(db, 'users', uid, 'blockedUsers'),
      (snap) => {
        logBlockQuerySuccess(subPath, subOp);
        setBlockedByMe(
          snap.docs
            .map((d) => {
              const fromField = d.data()?.blockedUserId;
              if (typeof fromField === 'string' && fromField) return fromField;
              return d.id;
            })
            .filter(Boolean),
        );
      },
      (error) => {
        logBlockQueryFailed(subPath, subOp, error);
        setBlockedByMe([]);
      },
    );

    const blocksPath = 'blocks(blockedUserId==uid)';
    const blocksOp = 'onSnapshot';
    logBlockQueryStart(blocksPath, blocksOp);

    const unsubBlocks = onSnapshot(
      query(collection(db, 'blocks'), where('blockedUserId', '==', uid)),
      (snap) => {
        logBlockQuerySuccess(blocksPath, blocksOp);
        setBlockedMe(
          snap.docs
            .map((d) => String(d.data()?.blockerId ?? ''))
            .filter(Boolean),
        );
      },
      (error) => {
        logBlockQueryFailed(blocksPath, blocksOp, error);
        setBlockedMe([]);
      },
    );

    return () => {
      unsubSub();
      unsubBlocks();
    };
  }, [uid, enabled]);

  return useMemo(
    () => new Set([...blockedByMe, ...blockedMe]),
    [blockedByMe, blockedMe],
  );
}

/**
 * Real-time: true if this peer is hidden (you blocked them or they blocked you).
 */
export function useIsPeerHidden(peerId: string | null | undefined): boolean {
  const hidden = useHiddenUserIds();
  return Boolean(peerId && hidden.has(peerId));
}
