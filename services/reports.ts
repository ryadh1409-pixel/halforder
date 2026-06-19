import { db } from './firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

/** Legacy UGC report reasons (orders, chat, profiles). */
export type ReportReason =
  | 'harassment'
  | 'spam'
  | 'scam'
  | 'offensive_language'
  | 'other';

export const UGC_REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment' },
  { id: 'spam', label: 'Spam' },
  { id: 'scam', label: 'Scam' },
  { id: 'offensive_language', label: 'Offensive Language' },
  { id: 'other', label: 'Other' },
];

/** Food-share report reasons. */
export type FoodShareReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'threats'
  | 'fake_account'
  | 'inappropriate_messages'
  | 'fraud'
  | 'no_show'
  | 'other';

export const FOOD_SHARE_REPORT_REASONS: {
  id: FoodShareReportReason;
  label: string;
}[] = [
  { id: 'harassment', label: 'Harassment' },
  { id: 'hate_speech', label: 'Hate Speech' },
  { id: 'spam', label: 'Spam' },
  { id: 'inappropriate_messages', label: 'Inappropriate Messages' },
  { id: 'fraud', label: 'Fraud' },
  { id: 'threats', label: 'Threats' },
  { id: 'no_show', label: 'No Show' },
  { id: 'other', label: 'Other' },
];

export type ReportStatus = 'open' | 'dismissed' | 'warned' | 'suspended' | 'banned';

export function reportContentIdChatMessage(
  chatId: string,
  messageId: string,
): string {
  return `chat:${chatId}:message:${messageId}`;
}

export function reportContentIdOrder(orderId: string): string {
  return `order:${orderId}`;
}

export function reportContentIdUser(reportedUserId: string): string {
  return `user:${reportedUserId}`;
}

export function reportContentIdFoodShareMatch(matchId: string): string {
  return `foodShareMatch:${matchId}`;
}

export async function submitReport(params: {
  reporterId: string;
  reportedUserId: string;
  contentId: string;
  reason: ReportReason;
  description?: string;
}): Promise<void> {
  if (!params.reporterId || !params.reportedUserId) {
    throw new Error('Missing reporter or reported user.');
  }
  if (params.reporterId === params.reportedUserId) {
    throw new Error('You cannot report yourself.');
  }
  const contentId = params.contentId?.trim() ?? '';
  if (!contentId) {
    throw new Error('Missing content reference.');
  }

  const orderMatch = contentId.match(/^order:(.+)$/);
  const messageMatch = contentId.match(/^chat:([^:]+):message:(.+)$/);
  await addDoc(collection(db, 'reports'), {
    userId: params.reporterId,
    reporterId: params.reporterId,
    reporterUid: params.reporterId,
    reportedUserId: params.reportedUserId,
    reportedUid: params.reportedUserId,
    contentId,
    orderId: orderMatch?.[1] ?? null,
    chatId: messageMatch?.[1] ?? null,
    messageId: messageMatch?.[2] ?? null,
    reason: params.reason,
    description: params.description?.trim() || null,
    status: 'open',
    source: 'ugc',
    createdAt: serverTimestamp(),
  });
}

export async function submitFoodShareReport(params: {
  reporterId: string;
  reportedUserId: string;
  matchId: string;
  reason: FoodShareReportReason;
  description?: string;
  screenshotUrls?: string[];
}): Promise<string> {
  if (!params.reporterId || !params.reportedUserId) {
    throw new Error('Missing reporter or reported user.');
  }
  if (params.reporterId === params.reportedUserId) {
    throw new Error('You cannot report yourself.');
  }
  const matchId = params.matchId?.trim() ?? '';
  if (!matchId) throw new Error('Missing match id.');

  const description =
    typeof params.description === 'string' ? params.description.trim() : '';
  const screenshots = Array.isArray(params.screenshotUrls)
    ? params.screenshotUrls.filter((u) => typeof u === 'string' && u.trim())
    : [];

  const ref = await addDoc(collection(db, 'reports'), {
    userId: params.reporterId,
    reporterId: params.reporterId,
    reporterUid: params.reporterId,
    reportedUserId: params.reportedUserId,
    reportedUid: params.reportedUserId,
    matchId,
    orderId: matchId,
    messageId: null,
    contentId: reportContentIdFoodShareMatch(matchId),
    reason: params.reason,
    description: description || null,
    screenshots,
    status: 'open',
    source: 'food_share',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
