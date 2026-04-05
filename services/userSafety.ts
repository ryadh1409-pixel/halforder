/**
 * UGC safety: reports (Firestore `reports`) + block list (`users` + subcollection).
 */
import { logError } from '@/utils/errorLogger';
import { blockUser as persistBlock } from '@/services/block';
import { type ReportReason, submitReport } from '@/services/reports';

export type ReportPayload = {
  reporterId: string;
  reportedUserId: string;
  orderId?: string | null;
  chatId?: string | null;
  reason?: string;
  context?: string;
};

/** Maps legacy / loose strings to `ReportReason`. */
export function coerceReportReason(raw: string | undefined): ReportReason {
  const r = (raw ?? 'other').trim().toLowerCase();
  if (r.includes('spam')) return 'spam';
  if (r.includes('abuse') || r.includes('harass')) return 'abuse';
  if (r.includes('inappropriate')) return 'inappropriate';
  if (r.includes('scam')) return 'scam';
  return 'other';
}

/** Creates a `reports` document. Prefer `submitReport` for new UI. */
export async function submitUserReport(payload: ReportPayload): Promise<void> {
  const reason = coerceReportReason(payload.reason);
  const message =
    [payload.context?.trim(), payload.reason && reason === 'other' ? payload.reason : '']
      .filter(Boolean)
      .join('\n')
      .trim();

  await submitReport({
    reporterId: payload.reporterId,
    reportedUserId: payload.reportedUserId,
    reason,
    message: message || '',
    orderId: payload.orderId ?? null,
    chatId: payload.chatId ?? null,
  });
}

export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await persistBlock(blockedId, blockerId);
}

export function handleSafetyError(error: unknown, fallback: string): string {
  logError(error, { alert: false });
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
