/**
 * UGC safety: Firestore `reports` + `users/.../blockedUsers`.
 */
import { getReadableErrorMessage } from '../utils/errorMessages';
import { logError } from '../utils/errorLogger';
import { blockUser as persistBlock } from './blockService';
import {
  reportContentIdChatMessage,
  reportContentIdOrder,
  reportContentIdUser,
  type ReportReason,
  submitReport,
} from './reports';

export type ReportPayload = {
  reporterId: string;
  reportedUserId: string;
  orderId?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  reason?: string;
  context?: string;
};

/** Maps free-text / legacy menu strings to `ReportReason`. */
export function coerceReportReason(raw: string | undefined): ReportReason {
  const r = (raw ?? '').trim().toLowerCase();
  if (r.includes('spam') || r.includes('scam')) return 'spam';
  if (
    r.includes('abuse') ||
    r.includes('harass') ||
    r.includes('inappropriate behavior')
  ) {
    return 'abuse';
  }
  if (r.includes('inappropriate')) return 'inappropriate';
  return 'inappropriate';
}

function buildContentId(payload: ReportPayload): string {
  if (payload.chatId && payload.messageId) {
    return reportContentIdChatMessage(payload.chatId, payload.messageId);
  }
  if (payload.orderId?.trim()) {
    return reportContentIdOrder(payload.orderId.trim());
  }
  if (payload.chatId?.trim()) {
    return `chat:${payload.chatId.trim()}`;
  }
  return reportContentIdUser(payload.reportedUserId);
}

export async function submitUserReport(payload: ReportPayload): Promise<void> {
  const reason = coerceReportReason(payload.reason);
  await submitReport({
    reporterId: payload.reporterId,
    reportedUserId: payload.reportedUserId,
    contentId: buildContentId(payload),
    reason,
  });
}

export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await persistBlock(blockedId, blockerId);
}

export function handleSafetyError(error: unknown, fallback: string): string {
  logError(error);
  const friendly = getReadableErrorMessage(error);
  if (friendly !== 'Something went wrong. Please try again.') {
    return friendly;
  }
  return fallback;
}
