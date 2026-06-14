import { FOOD_SHARE_PUSH } from '@/constants/foodSharePushTypes';
import { FOOD_SHARE_SUCCESS } from '@/lib/foodShareUx';
import {
  createInboxNotification,
  deepLinkForFoodSharePay,
  deepLinkForFoodShareWaiting,
  deepLinkForMatch,
  deepLinkForMatchChat,
  notifyAdminFoodShareEvent,
} from '@/services/foodShareInbox';

export async function notifyShareJoinedWaiting(input: {
  userId: string;
  foodName: string;
  adminFoodShareId: string;
}): Promise<void> {
  await createInboxNotification({
    recipientUid: input.userId,
    type: 'share_joined',
    title: 'Waiting for a partner',
    body: `You joined ${input.foodName}. We'll notify you when someone matches.`,
    deepLink: deepLinkForFoodShareWaiting(input.adminFoodShareId),
    adminFoodShareId: input.adminFoodShareId,
    pushType: FOOD_SHARE_PUSH.SHARE_JOINED,
    skipPush: true,
  });
}

export async function notifyPairingAwaitingPayment(input: {
  recipientUid: string;
  partnerFirstName: string;
  foodName: string;
  matchId: string;
  adminFoodShareId: string;
}): Promise<void> {
  await createInboxNotification({
    recipientUid: input.recipientUid,
    type: 'pairing_awaiting_payment',
    title: 'Complete your payment',
    body: `${input.partnerFirstName} matched on ${input.foodName}. Pay your share to activate the match.`,
    deepLink: deepLinkForFoodSharePay(input.matchId),
    matchId: input.matchId,
    adminFoodShareId: input.adminFoodShareId,
    pushType: FOOD_SHARE_PUSH.PAIRING_AWAITING_PAYMENT,
    pushData: { foodName: input.foodName },
  });
}

export async function notifyMatchCreated(input: {
  recipientUid: string;
  partnerFirstName: string;
  foodName: string;
  matchId: string;
  adminFoodShareId: string;
}): Promise<void> {
  await createInboxNotification({
    recipientUid: input.recipientUid,
    type: 'match_created',
    title: FOOD_SHARE_SUCCESS.matchFound,
    body: `${input.partnerFirstName} joined your meal share for ${input.foodName}.`,
    deepLink: deepLinkForMatchChat(input.matchId),
    matchId: input.matchId,
    adminFoodShareId: input.adminFoodShareId,
    pushType: FOOD_SHARE_PUSH.MATCH_CREATED,
    pushData: { foodName: input.foodName },
  });
}

export async function notifyChatMessage(input: {
  recipientUid: string;
  senderFirstName: string;
  preview: string;
  matchId: string;
}): Promise<void> {
  const body =
    input.preview.length > 80 ? `${input.preview.slice(0, 77)}…` : input.preview;
  try {
    await createInboxNotification({
      recipientUid: input.recipientUid,
      type: 'chat_message',
      title: `New message from ${input.senderFirstName}`,
      body,
      deepLink: deepLinkForMatchChat(input.matchId),
      matchId: input.matchId,
      pushType: FOOD_SHARE_PUSH.CHAT_MESSAGE,
      skipPush: true,
    });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error('[CHAT NOTIFY] failure', {
      recipientUid: input.recipientUid,
      matchId: input.matchId,
      code: err?.code ?? 'unknown',
      message: err?.message ?? String(error),
      error,
    });
  }
}

export async function notifyMatchCancelled(input: {
  recipientUid: string;
  cancelledByFirstName: string;
  foodName: string;
  matchId: string;
  cancelReason?: 'CANCELLED_BY_PARTNER' | 'CANCELLED_BY_USER' | 'CANCELLED_BY_ADMIN';
}): Promise<void> {
  const title =
    input.cancelReason === 'CANCELLED_BY_PARTNER'
      ? 'Partner cancelled'
      : 'Match cancelled';
  await createInboxNotification({
    recipientUid: input.recipientUid,
    type: 'match_cancelled',
    title,
    body: `${input.cancelledByFirstName} cancelled the match for ${input.foodName}.`,
    deepLink: deepLinkForMatch(input.matchId),
    matchId: input.matchId,
    pushType: FOOD_SHARE_PUSH.MATCH_CANCELLED,
  });
}

export async function notifyReportSubmitted(input: {
  reporterUid: string;
  matchId: string;
}): Promise<void> {
  await createInboxNotification({
    recipientUid: input.reporterUid,
    type: 'report_submitted',
    title: FOOD_SHARE_SUCCESS.reportSubmitted,
    body: 'Thanks for helping keep HalfOrder safe. Our team will review your report.',
    deepLink: deepLinkForMatch(input.matchId),
    matchId: input.matchId,
    pushType: FOOD_SHARE_PUSH.REPORT_SUBMITTED,
    skipPush: true,
  });
}

export async function notifyPartnerBlocked(input: {
  recipientUid: string;
  blockerFirstName: string;
  matchId?: string;
}): Promise<void> {
  await createInboxNotification({
    recipientUid: input.recipientUid,
    type: 'user_blocked',
    title: 'Match ended',
    body: `${input.blockerFirstName} ended this match. You will not be paired together again.`,
    deepLink: input.matchId ? deepLinkForMatch(input.matchId) : '/(tabs)/swipe',
    matchId: input.matchId ?? null,
    pushType: FOOD_SHARE_PUSH.USER_BLOCKED,
  });
}

export async function notifyReportSubmittedAdmin(input: {
  matchId: string;
  reporterUid: string;
  reportedUid: string;
  reportId?: string;
}): Promise<void> {
  await notifyAdminFoodShareEvent({
    title: 'User reported in meal share',
    message: `Report ${input.reportId ?? ''} filed for match ${input.matchId}.`,
    kind: 'user_reported',
    matchId: input.matchId,
  });
}

export async function notifyAdminMatchCreated(input: {
  matchId: string;
  adminFoodShareId: string;
  foodName: string;
}): Promise<void> {
  await notifyAdminFoodShareEvent({
    title: 'New meal share match',
    message: `${input.foodName} — match ${input.matchId}`,
    kind: 'match_created',
    matchId: input.matchId,
    adminFoodShareId: input.adminFoodShareId,
  });
}

export async function notifyAdminMatchCancelled(input: {
  matchId: string;
  adminFoodShareId?: string;
}): Promise<void> {
  await notifyAdminFoodShareEvent({
    title: 'Meal share match cancelled',
    message: `Match ${input.matchId} was cancelled.`,
    kind: 'match_cancelled',
    matchId: input.matchId,
    adminFoodShareId: input.adminFoodShareId,
  });
}

export async function notifyLifecycleUpdate(input: {
  recipientUid: string;
  matchId: string;
  orderId?: string | null;
  title: string;
  body: string;
  type:
    | 'order_placed'
    | 'driver_assigned'
    | 'driver_arrived'
    | 'picked_up'
    | 'delivered'
    | 'order_completed';
  pushType: string;
}): Promise<void> {
  const orderId = input.orderId?.trim() || null;
  const deepLink =
    orderId &&
    ['driver_assigned', 'driver_arrived', 'picked_up', 'delivered', 'order_placed', 'order_completed'].includes(
      input.type,
    )
      ? `/track-order/${encodeURIComponent(orderId)}`
      : deepLinkForMatch(input.matchId);
  await createInboxNotification({
    recipientUid: input.recipientUid,
    type: input.type,
    title: input.title,
    body: input.body,
    deepLink,
    matchId: input.matchId,
    pushType: input.pushType,
  });
}
