/**
 * Instagram-style blocked accounts: live `users/{uid}.blockedUsers` + profile rows (name, avatar).
 * Subscribes only to the signed-in user's document — same security model as Profile.
 */
import { useBlock } from '@/hooks/useBlock';
import { getPublicUserFields } from '@/services/users';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type BlockedUserRow = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type UseBlockedUsersResult = {
  uid: string | null;
  /** Ordered list matching `blockedUserIds` from Firestore. */
  blockedUsers: BlockedUserRow[];
  blockedUserIds: string[];
  /** True while resolving names/avatars for current ids. */
  loadingProfiles: boolean;
  /** Remove id from `blockedUsers` via `arrayRemove` + subcollection cleanup (see `blockService`). */
  unblockUser: (targetUserId: string) => Promise<void>;
};

export function useBlockedUsers(): UseBlockedUsersResult {
  const { uid, blockedByMeIds, unblockUser: unblockFromService } = useBlock();
  const [profileMap, setProfileMap] = useState<
    Record<string, BlockedUserRow | undefined>
  >({});
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  useEffect(() => {
    if (blockedByMeIds.length === 0) {
      setProfileMap({});
      setLoadingProfiles(false);
      return;
    }
    let cancelled = false;
    setLoadingProfiles(true);
    void (async () => {
      const next: Record<string, BlockedUserRow> = {};
      await Promise.all(
        blockedByMeIds.map(async (id) => {
          try {
            const p = await getPublicUserFields(id);
            next[id] = {
              userId: id,
              displayName: p?.name?.trim() || 'User',
              avatarUrl: p?.avatar ?? null,
            };
          } catch {
            next[id] = {
              userId: id,
              displayName: 'User',
              avatarUrl: null,
            };
          }
        }),
      );
      if (!cancelled) {
        setProfileMap(next);
        setLoadingProfiles(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blockedByMeIds.join('|')]);

  const blockedUsers = useMemo((): BlockedUserRow[] => {
    return blockedByMeIds.map((id) => {
      const row = profileMap[id];
      if (row) return row;
      return {
        userId: id,
        displayName: '…',
        avatarUrl: null,
      };
    });
  }, [blockedByMeIds, profileMap]);

  const unblockUser = useCallback(
    async (targetUserId: string) => {
      await unblockFromService(targetUserId);
    },
    [unblockFromService],
  );

  return {
    uid,
    blockedUsers,
    blockedUserIds: blockedByMeIds,
    loadingProfiles,
    unblockUser,
  };
}
