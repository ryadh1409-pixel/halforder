/**
 * Blocked accounts list from `users/{uid}/blockedUsers/*` only.
 * Does not read other users' `users/{blockedId}` docs (rules: self or admin only).
 */
import { useBlock } from './useBlock';
import { useCallback, useMemo } from 'react';

export type BlockedUserRow = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type UseBlockedUsersResult = {
  uid: string | null;
  blockedUsers: BlockedUserRow[];
  blockedUserIds: string[];
  loadingProfiles: boolean;
  unblockUser: (targetUserId: string) => Promise<void>;
};

export function useBlockedUsers(): UseBlockedUsersResult {
  const { uid, blockedByMeIds, unblockUser: unblockFromService } = useBlock();

  const blockedUsers = useMemo((): BlockedUserRow[] => {
    return blockedByMeIds.map((id) => ({
      userId: id,
      displayName: 'Blocked user',
      avatarUrl: null,
    }));
  }, [blockedByMeIds]);

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
    loadingProfiles: false,
    unblockUser,
  };
}
