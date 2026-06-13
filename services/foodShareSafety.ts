import { FOOD_SHARE_ERRORS } from '@/lib/foodShareUx';
import { writeModerationAudit } from '@/services/foodShareAudit';
import { blockUser as blockUserWithMirror } from '@/services/blocks';
import { hasBlockBetween } from '@/services/blocks';
import { auth, db, functions } from '@/services/firebase';
import {
  notifyMatchCancelled,
  notifyPartnerBlocked,
  notifyReportSubmitted,
  notifyReportSubmittedAdmin,
  notifyAdminMatchCancelled,
} from '@/services/foodShareNotify';
import {
  submitFoodShareReport,
  type FoodShareReportReason,
} from '@/services/reports';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';

export type CancelFoodShareResult = {
  ok: true;
  refundAttempted?: boolean;
};

export function canCancelFoodShareMatch(lifecycle: string, orderStatus: string | null): boolean {
  const lc = lifecycle.toUpperCase();
  if (lc === 'CANCELLED') return false;
  if (
    lc === 'ORDER_PLACED' ||
    lc === 'DRIVER_ASSIGNED' ||
    lc === 'PICKED_UP' ||
    lc === 'DELIVERED' ||
    lc === 'COMPLETED'
  ) {
    return false;
  }
  if (orderStatus && orderStatus.trim()) return false;
  return true;
}

export async function cancelWaitingFoodShare(
  adminFoodShareId: string,
): Promise<CancelFoodShareResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error(FOOD_SHARE_ERRORS.signInRequired);

  const fn = httpsCallable(functions, 'cancelFoodShareMatch');
  await fn({ scope: 'waiting', adminFoodShareId });
  return { ok: true };
}

export async function cancelFoodShareMatch(input: {
  matchId: string;
  partnerUid?: string;
  cancelledByFirstName?: string;
  foodName?: string;
  adminFoodShareId?: string;
}): Promise<CancelFoodShareResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error(FOOD_SHARE_ERRORS.signInRequired);

  const matchSnap = await getDoc(doc(db, 'matches', input.matchId));
  if (matchSnap.exists()) {
    const data = matchSnap.data() ?? {};
    if (
      !canCancelFoodShareMatch(
        String(data.lifecycle ?? ''),
        typeof data.orderStatus === 'string' ? data.orderStatus : null,
      )
    ) {
      throw new Error(
        'This match cannot be cancelled after the order has been placed.',
      );
    }
  }

  const fn = httpsCallable(functions, 'cancelFoodShareMatch');
  const result = await fn({ scope: 'match', matchId: input.matchId });
  const data = (result.data ?? {}) as { refundAttempted?: boolean };

  await writeModerationAudit({
    action: 'match_cancelled',
    matchId: input.matchId,
    targetUid: input.partnerUid ?? null,
    adminFoodShareId: input.adminFoodShareId ?? null,
    cancelReason: 'CANCELLED_BY_USER',
    metadata: { refundAttempted: data.refundAttempted === true },
  });

  void notifyAdminMatchCancelled({
    matchId: input.matchId,
    adminFoodShareId: input.adminFoodShareId,
  });

  if (input.partnerUid) {
    void notifyMatchCancelled({
      recipientUid: input.partnerUid,
      cancelledByFirstName: input.cancelledByFirstName ?? 'Your partner',
      foodName: input.foodName ?? 'your meal share',
      matchId: input.matchId,
      cancelReason: 'CANCELLED_BY_PARTNER',
    });
  }

  return { ok: true, refundAttempted: data.refundAttempted === true };
}

export async function reportFoodShareUser(input: {
  reportedUid: string;
  matchId: string;
  reason: FoodShareReportReason;
  description?: string;
  screenshotUrls?: string[];
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error(FOOD_SHARE_ERRORS.signInRequired);

  const reportId = await submitFoodShareReport({
    reporterId: uid,
    reportedUserId: input.reportedUid,
    matchId: input.matchId,
    reason: input.reason,
    description: input.description,
    screenshotUrls: input.screenshotUrls,
  });

  await writeModerationAudit({
    action: 'report_submitted',
    targetUid: input.reportedUid,
    matchId: input.matchId,
    reportId,
    metadata: { reason: input.reason },
  });

  void notifyReportSubmitted({
    reporterUid: uid,
    matchId: input.matchId,
  });
  void notifyReportSubmittedAdmin({
    matchId: input.matchId,
    reporterUid: uid,
    reportedUid: input.reportedUid,
    reportId,
  });

  return reportId;
}

export async function blockFoodShareUser(input: {
  blockedUid: string;
  matchId?: string;
  blockerFirstName?: string;
  foodName?: string;
  adminFoodShareId?: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error(FOOD_SHARE_ERRORS.signInRequired);

  await blockUserWithMirror(uid, input.blockedUid);

  if (input.matchId) {
    const matchSnap = await getDoc(doc(db, 'matches', input.matchId));
    if (matchSnap.exists()) {
      const data = matchSnap.data() ?? {};
      if (
        data.status !== 'CANCELLED' &&
        data.lifecycle !== 'CANCELLED' &&
        canCancelFoodShareMatch(
          String(data.lifecycle ?? ''),
          typeof data.orderStatus === 'string' ? data.orderStatus : null,
        )
      ) {
        await cancelFoodShareMatch({
          matchId: input.matchId,
          partnerUid: input.blockedUid,
          cancelledByFirstName: 'You',
          foodName: input.foodName,
          adminFoodShareId: input.adminFoodShareId,
        });
      }
    }
  }

  await writeModerationAudit({
    action: 'user_blocked',
    targetUid: input.blockedUid,
    matchId: input.matchId ?? null,
    adminFoodShareId: input.adminFoodShareId ?? null,
  });

  void notifyPartnerBlocked({
    recipientUid: input.blockedUid,
    blockerFirstName: input.blockerFirstName ?? 'A user',
    matchId: input.matchId,
  });
}

export async function assertNoBlockForFoodShare(
  uidA: string,
  uidB: string,
): Promise<void> {
  if (await hasBlockBetween(uidA, uidB)) {
    throw new Error('You cannot interact with this user.');
  }
}
