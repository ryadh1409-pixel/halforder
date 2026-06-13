import { FOOD_SHARE_PUSH } from '@/constants/foodSharePushTypes';
import { FOOD_SHARE_SUCCESS } from '@/lib/foodShareUx';
import {
  createInboxNotification,
  deepLinkForFoodSharePay,
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
    deepLink: '/(tabs)/swipe',
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
  await createInboxNotification({
    recipientUid: input.recipientUid,
    type: 'chat_message',
    title: `New message from ${input.senderFirstName}`,
    body,
    deepLink: deepLinkForMatchChat(input.matchId),
    matchId: input.matchId,
    pushType: FOOD_SHARE_PUSH.CHAT_MESSAGE,
  });
}

export async function notifyMatchCancelled(input: {
  recipientUid: string;
  cancelledByFirstName: string;
  foodName: string;
  matchId: string;
}): Promise<void> {
  await createInboxNotification({
    recipientUid: input.recipientUid,
    type: 'match_cancelled',
    title: 'Match cancelled',
    body: `${input.cancelledByFirstName} cancelled the match for ${input.foodName}.`,
    deepLink: deepLinkForMatch(input.matchId),
    matchId: input.matchId,
    pushType: FOOD_SHARE_PUSH.MATCH_CANCELLED,
  });
}

export async function notifyReportSubmittedAdmin(input: {
  matchId: string;
  reporterUid: string;
  reportedUid: string;
}): Promise<void> {
  await notifyAdminFoodShareEvent({
    title: 'User reported in meal share',
    message: `Report filed for match ${input.matchId}.`,
    kind: 'user_reported',
    matchId: input.matchId,
  });
  await createInboxNotification({
    recipientUid: input.reporterUid,
    type: 'report_submitted',
    title: FOOD_SHARE_SUCCESS.reportSubmitted,
    body: 'Thanks for helping keep HalfOrder safe.',
    deepLink: deepLinkForMatch(input.matchId),
    matchId: input.matchId,
    pushType: FOOD_SHARE_PUSH.REPORT_SUBMITTED,
    skipPush: true,
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
  await createInboxNotification({
    recipientUid: input.recipientUid,
    type: input.type,
    title: input.title,
    body: input.body,
    deepLink: deepLinkForMatch(input.matchId),
    matchId: input.matchId,
    pushType: input.pushType,
  });
}
