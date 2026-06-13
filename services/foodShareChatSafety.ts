import { auth, db } from '@/services/firebase';
import { writeModerationAudit } from '@/services/foodShareAudit';
import {
  reportContentIdFoodShareMatch,
  submitFoodShareReport,
  type FoodShareReportReason,
} from '@/services/reports';
import { notifyReportSubmitted } from '@/services/foodShareNotify';
import { doc, getDoc } from 'firebase/firestore';

export type ChatReportScope = 'message' | 'conversation';

export const CHAT_REPORT_REASONS: { id: FoodShareReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment' },
  { id: 'hate_speech', label: 'Hate Speech' },
  { id: 'spam', label: 'Spam' },
  { id: 'inappropriate_messages', label: 'Sexual Content' },
  { id: 'threats', label: 'Threats' },
  { id: 'fraud', label: 'Fraud' },
  { id: 'other', label: 'Other' },
];

export async function reportFoodShareChat(input: {
  reportedUid: string;
  matchId: string;
  scope: ChatReportScope;
  messageId?: string;
  messagePreview?: string;
  reason: FoodShareReportReason;
  description?: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');

  const descriptionParts = [
    input.scope === 'message' ? `Reported message: ${input.messageId ?? 'unknown'}` : 'Reported entire conversation',
    input.messagePreview ? `Preview: ${input.messagePreview.slice(0, 200)}` : '',
    input.description?.trim() ?? '',
  ].filter(Boolean);

  const reportId = await submitFoodShareReport({
    reporterId: uid,
    reportedUserId: input.reportedUid,
    matchId: input.matchId,
    reason: input.reason,
    description: descriptionParts.join('\n'),
  });

  await writeModerationAudit({
    action: 'report_submitted',
    targetUid: input.reportedUid,
    matchId: input.matchId,
    reportId,
    metadata: {
      scope: input.scope,
      messageId: input.messageId ?? null,
      contentId: reportContentIdFoodShareMatch(input.matchId),
    },
  });

  void notifyReportSubmitted({ reporterUid: uid, matchId: input.matchId });
  return reportId;
}

export async function subscribeChatSafetyState(uid: string): Promise<{
  violationCount: number;
  restrictedUntilMs: number | null;
  accountReviewFlag: boolean;
}> {
  const snap = await getDoc(doc(db, 'users', uid));
  const safety = (snap.data()?.chatSafety ?? {}) as Record<string, unknown>;
  const until = safety.chatRestrictedUntil as { toMillis?: () => number } | undefined;
  return {
    violationCount:
      typeof safety.violationCount === 'number' ? safety.violationCount : 0,
    restrictedUntilMs:
      until && typeof until.toMillis === 'function' ? until.toMillis() : null,
    accountReviewFlag: safety.accountReviewFlag === true,
  };
}
