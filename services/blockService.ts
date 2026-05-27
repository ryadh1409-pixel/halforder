/**
 * Block / unblock service (production).
 *
 * - **Block:** `users/{currentUserId}/blockedUsers/{targetUserId}` with
 *   `{ blockedUserId, createdAt }`.
 * - **Unblock:** deletes that subcollection document (+ legacy `blocks` cleanup).
 *
 * `blockUser(currentUserId, targetUserId)` — current user blocks target.
 */
import { isUserBlocked as isUserBlockedFirestore } from './block';
import type { BlockFilterCurrentUser } from '../utils/filter';
import {
  blockUser as blockUserPersist,
  unblockUser as unblockUserPersist,
} from './blocks';

export type { BlockFilterCurrentUser } from '../utils/filter';

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
 * **Sync (instant UI):** pass `{ uid, hiddenUserIds }` from `useHiddenUserIds()`.
 * True if `targetUserId` is in the hidden set (users you blocked).
 *
 * **Async (server):** pass two strings — subcollection + legacy `blocks` check.
 */
export function isUserBlocked(
  currentUser: BlockFilterCurrentUser,
  targetUserId: string,
): boolean;
export function isUserBlocked(
  currentUserId: string,
  targetUserId: string,
): Promise<boolean>;
export function isUserBlocked(
  currentUser: BlockFilterCurrentUser | string,
  targetUserId: string,
): boolean | Promise<boolean> {
  if (typeof currentUser === 'string') {
    return isUserBlockedFirestore(currentUser, targetUserId);
  }
  if (!targetUserId) return false;
  if (currentUser.uid && targetUserId === currentUser.uid) return false;
  return currentUser.hiddenUserIds.has(targetUserId);
}
