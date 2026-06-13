import type { FoodShareMatchLifecycle } from '@/types/foodShare';

/** User-facing success copy. */
export const FOOD_SHARE_SUCCESS = {
  matchFound: 'Match found!',
  paymentSubmitted: 'Payment submitted.',
  paymentConfirmed: 'Payment confirmed!',
  shareJoined: 'Share joined successfully.',
  reportSubmitted: 'Report submitted.',
  userBlocked: 'User blocked.',
  orderCompleted: 'Order completed.',
  messageSent: 'Message sent.',
} as const;

/** User-facing error copy — never expose raw SDK messages. */
export const FOOD_SHARE_ERRORS = {
  matchFull: 'Match is already full.',
  connectionLost: 'Connection lost. Check your network and try again.',
  sendMessageFailed: 'Failed to send message. Please try again.',
  unableToJoin: 'Unable to join share. Please try again.',
  shareUnavailable: 'Share no longer available.',
  signInRequired: 'Please sign in to continue.',
  alreadyMatched: 'You already matched on this card.',
  matchNotFound: 'Match not found.',
  chatUnavailable: 'Chat is unavailable right now.',
  cancelFailed: 'Could not cancel match. Please try again.',
  reportFailed: 'Could not submit report. Please try again.',
  blockFailed: 'Could not block user. Please try again.',
  paymentFailed: 'Payment failed. Please try again.',
  paymentCanceled: 'Payment canceled.',
} as const;

export type FoodShareNotificationType =
  | 'share_joined'
  | 'pairing_awaiting_payment'
  | 'payment_success'
  | 'payment_failed'
  | 'partner_paid'
  | 'refund_processed'
  | 'match_activated'
  | 'match_created'
  | 'chat_message'
  | 'order_placed'
  | 'driver_assigned'
  | 'driver_arrived'
  | 'picked_up'
  | 'delivered'
  | 'match_cancelled'
  | 'chat_message_blocked'
  | 'chat_warning'
  | 'order_completed';

export type FoodShareLifecycleAlertKey =
  | 'order_placed'
  | 'driver_assigned'
  | 'driver_arrived'
  | 'picked_up'
  | 'delivered'
  | 'completed'
  | 'cancelled';

const LIFECYCLE_ALERT_KEYS: Record<string, FoodShareLifecycleAlertKey | null> = {
  ORDER_PLACED: 'order_placed',
  DRIVER_ASSIGNED: 'driver_assigned',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export function resolveFoodShareLifecycleAlertKey(
  lifecycle: FoodShareMatchLifecycle | string | null | undefined,
  deliveryStatus: string | null | undefined,
): FoodShareLifecycleAlertKey | null {
  if (deliveryStatus === 'near_customer' || deliveryStatus === 'arrived') {
    return 'driver_arrived';
  }
  if (!lifecycle) return null;
  return LIFECYCLE_ALERT_KEYS[lifecycle.toString().toUpperCase()] ?? null;
}

export const FOOD_SHARE_LIFECYCLE_ALERTS: Record<
  FoodShareLifecycleAlertKey,
  { title: string; message: string }
> = {
  order_placed: {
    title: 'Order placed',
    message: 'Your shared meal order has been placed.',
  },
  driver_assigned: {
    title: 'Driver assigned',
    message: 'A driver is on the way to pick up your food.',
  },
  driver_arrived: {
    title: 'Driver arrived',
    message: 'Your driver has arrived nearby.',
  },
  picked_up: {
    title: 'Food picked up',
    message: 'Your order has been picked up and is on the way.',
  },
  delivered: {
    title: 'Food delivered',
    message: 'Your shared meal has been delivered.',
  },
  completed: {
    title: 'Order completed',
    message: 'Your meal share is complete. Enjoy!',
  },
  cancelled: {
    title: 'Match cancelled',
    message: 'This meal share match was cancelled.',
  },
};

export function foodShareErrorMessage(error: unknown, fallback?: string): string {
  const msg =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : typeof error === 'string'
        ? error.trim()
        : '';
  const lower = msg.toLowerCase();
  if (lower.includes('full') || lower.includes('already matched')) {
    return FOOD_SHARE_ERRORS.matchFull;
  }
  if (lower.includes('no longer available') || lower.includes('not active')) {
    return FOOD_SHARE_ERRORS.shareUnavailable;
  }
  if (
    lower.includes('network') ||
    lower.includes('unavailable') ||
    lower.includes('offline')
  ) {
    return FOOD_SHARE_ERRORS.connectionLost;
  }
  if (lower.includes('sign in')) {
    return FOOD_SHARE_ERRORS.signInRequired;
  }
  if (msg && Object.values(FOOD_SHARE_ERRORS).includes(msg as never)) {
    return msg;
  }
  return fallback ?? FOOD_SHARE_ERRORS.unableToJoin;
}
