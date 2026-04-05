import { db } from '@/services/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

/** Values stored on `reports` docs (App Store / UGC safety). */
export type ReportReason =
  | 'spam'
  | 'abuse'
  | 'inappropriate'
  | 'scam'
  | 'other';

export const UGC_REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam' },
  { id: 'abuse', label: 'Abuse / harassment' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'scam', label: 'Scam' },
  { id: 'other', label: 'Other' },
];

export async function submitReport(params: {
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  /** Optional free-text context (message excerpt, notes). */
  message?: string;
  orderId?: string | null;
  chatId?: string | null;
}): Promise<void> {
  if (!params.reporterId || !params.reportedUserId) {
    throw new Error('Missing reporter or reported user.');
  }
  if (params.reporterId === params.reportedUserId) {
    throw new Error('You cannot report yourself.');
  }

  const ts = serverTimestamp();
  const message = params.message?.trim() ?? '';

  await addDoc(collection(db, 'reports'), {
    reporterId: params.reporterId,
    reportedUserId: params.reportedUserId,
    orderId: params.orderId ?? null,
    chatId: params.chatId ?? null,
    reason: params.reason,
    message,
    createdAt: ts,
    timestamp: ts,
  });
}
