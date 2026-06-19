import { auth, db } from '@/services/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type ModerationAuditAction =
  | 'share_cancelled_waiting'
  | 'match_cancelled'
  | 'refund_requested'
  | 'refund_processed'
  | 'report_submitted'
  | 'user_blocked'
  | 'user_unblocked'
  | 'chat_message_blocked'
  | 'chat_warning'
  | 'chat_temporary_restriction'
  | 'chat_account_review_flag'
  | 'admin_dismiss'
  | 'admin_warn'
  | 'admin_suspend'
  | 'admin_ban'
  | 'admin_delete_message';

export async function writeModerationAudit(input: {
  action: ModerationAuditAction;
  actorUid?: string;
  targetUid?: string | null;
  matchId?: string | null;
  adminFoodShareId?: string | null;
  reportId?: string | null;
  cancelReason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const actorUid = input.actorUid ?? auth.currentUser?.uid ?? null;
  if (!actorUid) return null;

  const ref = await addDoc(collection(db, 'moderationAuditLog'), {
    action: input.action,
    actorUid,
    targetUid: input.targetUid ?? null,
    matchId: input.matchId ?? null,
    adminFoodShareId: input.adminFoodShareId ?? null,
    reportId: input.reportId ?? null,
    cancelReason: input.cancelReason ?? null,
    metadata: input.metadata ?? {},
    source: 'food_share',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
