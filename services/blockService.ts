/**
 * Production block API — consistent argument order everywhere:
 * `blockUser(currentUserId, targetUserId)` = signed-in user blocks `targetUserId`.
 *
 * Persists `users/{currentUserId}.blockedUsers` (array + subcollection) and legacy `blocks` docs.
 */
import { isUserBlocked as isUserBlockedCore } from '@/services/block';
import {
  blockUser as blockUserPersist,
  unblockUser as unblockUserPersist,
} from '@/services/blocks';

export async function blockUser(
  currentUserId: string,
  targetUserId: string,
): Promise<void> {
  return blockUserPersist(currentUserId, targetUserId);
}

export async function unblockUser(
  currentUserId: string,
  targetUserId: string,
): Promise<void> {
  return unblockUserPersist(currentUserId, targetUserId);
}

/**
 * True if either user blocked the other (arrays, subcollections, legacy `blocks`).
 */
export async function isUserBlocked(
  currentUserId: string,
  targetUserId: string,
): Promise<boolean> {
  return isUserBlockedCore(currentUserId, targetUserId);
}
