import { FOOD_CARD_ORDER_MAX_USERS } from '@/constants/adminFoodCards';

/** Public marketplace seat status for Swipe catalog cards. */
export type SwipeMarketplaceStatus =
  | 'available'
  | 'waiting_for_member'
  | 'matched'
  | 'ready'
  | 'cancelled_by_admin';

export const SWIPE_MARKETPLACE_STATUS_LABEL: Record<
  SwipeMarketplaceStatus,
  string
> = {
  available: 'Available',
  waiting_for_member: 'Waiting for 1 Member',
  matched: 'Matched',
  ready: 'Ready for Restaurant',
  cancelled_by_admin: 'Cancelled by Admin',
};

export const SWIPE_STALE_WAITING_MS = 30 * 60 * 1000;

export type SwipeQueueMarketplaceState = {
  waitingUserId: string | null;
  waitingUserFirstName: string | null;
  /** Epoch ms when the current waiter joined; null if none. */
  waitingSinceMs: number | null;
  activeMatchId: string | null;
  marketplaceStatus: SwipeMarketplaceStatus | null;
};

export function emptySwipeQueueMarketplaceState(): SwipeQueueMarketplaceState {
  return {
    waitingUserId: null,
    waitingUserFirstName: null,
    waitingSinceMs: null,
    activeMatchId: null,
    marketplaceStatus: null,
  };
}

export function resolveSwipeMarketplaceStatus(
  queue: SwipeQueueMarketplaceState | null | undefined,
): SwipeMarketplaceStatus {
  if (!queue) return 'available';
  const raw = queue.marketplaceStatus;
  if (raw === 'cancelled_by_admin') return 'cancelled_by_admin';
  if (raw === 'ready') return 'ready';
  if (raw === 'matched' || (queue.activeMatchId && !queue.waitingUserId)) {
    return 'matched';
  }
  if (queue.waitingUserId) return 'waiting_for_member';
  return 'available';
}

export function swipeMarketplacePeopleJoined(
  status: SwipeMarketplaceStatus,
): number {
  if (status === 'waiting_for_member') return 1;
  if (status === 'matched' || status === 'ready') {
    return FOOD_CARD_ORDER_MAX_USERS;
  }
  return 0;
}

export function swipeMarketplaceSpotsLeft(status: SwipeMarketplaceStatus): number {
  return Math.max(0, FOOD_CARD_ORDER_MAX_USERS - swipeMarketplacePeopleJoined(status));
}

/** Cards in matched/ready lock — join is replaced by a status badge. */
export function isSwipeMarketplaceJoinLocked(
  status: SwipeMarketplaceStatus,
): boolean {
  return status === 'matched' || status === 'ready';
}

export function formatWaitingElapsed(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
