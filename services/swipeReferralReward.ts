/**
 * Client helpers for Swipe Delivery referral reward unlock / acknowledge.
 */
import { auth, db } from '@/services/firebase';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export const SWIPE_REFERRAL_REWARD_TYPE = 'swipe_referral';

export type SwipeReferralReward = {
  id: string;
  code: string;
  discountPercent: number;
  name: string;
  status: 'available' | 'redeemed';
  unlockAcknowledged: boolean;
  swipeReferralPromoId: string | null;
};

function parseReward(
  id: string,
  raw: Record<string, unknown>,
): SwipeReferralReward | null {
  if (raw.type !== SWIPE_REFERRAL_REWARD_TYPE) return null;
  const status = raw.status === 'redeemed' ? 'redeemed' : 'available';
  const code = typeof raw.code === 'string' ? raw.code.trim().toUpperCase() : '';
  const discountPercent =
    typeof raw.discountValue === 'number' && Number.isFinite(raw.discountValue)
      ? Math.round(raw.discountValue)
      : 0;
  if (!code || discountPercent <= 0) return null;
  return {
    id,
    code,
    discountPercent,
    name: typeof raw.name === 'string' ? raw.name.trim() : 'Referral Reward',
    status,
    unlockAcknowledged: raw.unlockAcknowledged === true,
    swipeReferralPromoId:
      typeof raw.swipeReferralPromoId === 'string'
        ? raw.swipeReferralPromoId
        : null,
  };
}

export function subscribeUnacknowledgedSwipeReferralRewards(
  onData: (rows: SwipeReferralReward[]) => void,
): Unsubscribe {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'users', uid, 'emoRewards'),
    (snap) => {
      const rows: SwipeReferralReward[] = [];
      for (const d of snap.docs) {
        const parsed = parseReward(d.id, d.data() as Record<string, unknown>);
        if (!parsed) continue;
        if (parsed.status !== 'available') continue;
        if (parsed.unlockAcknowledged) continue;
        rows.push(parsed);
      }
      rows.sort((a, b) => a.code.localeCompare(b.code));
      onData(rows);
    },
    () => onData([]),
  );
}

export async function acknowledgeSwipeReferralRewardUnlock(
  rewardId: string,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !rewardId.trim()) return;
  await updateDoc(doc(db, 'users', uid, 'emoRewards', rewardId.trim()), {
    unlockAcknowledged: true,
  });
}
