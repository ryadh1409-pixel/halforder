import { auth, db } from '@/services/firebase';
import { writeModerationAudit } from '@/services/foodShareAudit';
import type { ReportStatus } from '@/services/reports';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

export async function resolveFoodShareReport(input: {
  reportId: string;
  status: ReportStatus;
  reportedUserId?: string | null;
  matchId?: string | null;
  note?: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');

  const auditAction =
    input.status === 'dismissed'
      ? 'admin_dismiss'
      : input.status === 'warned'
        ? 'admin_warn'
        : input.status === 'suspended'
          ? 'admin_suspend'
          : 'admin_ban';

  await updateDoc(doc(db, 'reports', input.reportId), {
    status: input.status,
    adminResolution: input.status,
    adminResolvedAt: serverTimestamp(),
    adminResolvedBy: uid,
    adminNote: input.note?.trim() || null,
  });

  if (input.reportedUserId) {
    if (input.status === 'banned') {
      await updateDoc(doc(db, 'users', input.reportedUserId), { banned: true });
    } else if (input.status === 'suspended') {
      await updateDoc(doc(db, 'users', input.reportedUserId), {
        suspended: true,
        suspendedAt: serverTimestamp(),
      });
    } else if (input.status === 'warned') {
      await updateDoc(doc(db, 'users', input.reportedUserId), {
        warnedAt: serverTimestamp(),
        lastWarnReportId: input.reportId,
      });
    }
  }

  await writeModerationAudit({
    action: auditAction,
    targetUid: input.reportedUserId ?? null,
    matchId: input.matchId ?? null,
    reportId: input.reportId,
    metadata: { status: input.status, note: input.note ?? null },
  });
}
