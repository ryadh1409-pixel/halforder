/**
 * Client helpers for the Hi emooo Easter Egg reward (chat trigger: exact "Hi Emo").
 */
import { httpsCallable } from 'firebase/functions';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db, functions, syncAuthForFirestoreReads } from '@/services/firebase';

export const HI_EMOOO_PROMO_CODE = 'HI EMOOO';
export const HI_EMOOO_PROMO_NAME = 'Hi emooo';
export const HI_EMOOO_PERCENT = 50;
export const HI_EMOOO_REWARD_DOC_ID = 'hi-emooo';

export const HI_EMOOO_SUCCESS_REPLY =
  "🎉 You found my secret! Here's your 50% gift!";
export const HI_EMOOO_ALREADY_CLAIMED_REPLY =
  "❤️ You've already claimed your Hi emooo gift.";

export type EmoHiEmoooDiscount = {
  code: string;
  name: string;
  promoId?: string;
  discountType: 'percent';
  discountValue: number;
  status: 'available' | 'redeemed';
  claimedAtMs?: number;
  createdAtMs?: number;
  expiresAtMs?: number | null;
  redeemedAtMs?: number;
  redeemedOrderId?: string;
};

export type ClaimEmoHiEmoooResult = {
  ok: boolean;
  alreadyClaimed?: boolean;
  reason?: string;
  message: string;
  discount?: {
    code: string;
    name: string;
    discountType: 'percent';
    discountValue: number;
    status: 'available';
  };
};

/** Exact chat trigger: "Hi Emo" (case-insensitive, trimmed). */
export function isHiEmoChatTrigger(raw: string): boolean {
  return raw.trim().toLowerCase() === 'hi emo';
}

function buildAvailableDiscount(nowMs: number) {
  return {
    code: HI_EMOOO_PROMO_CODE,
    name: HI_EMOOO_PROMO_NAME,
    promoId: HI_EMOOO_REWARD_DOC_ID,
    discountType: 'percent' as const,
    discountValue: HI_EMOOO_PERCENT,
    status: 'available' as const,
    claimedAtMs: nowMs,
    createdAtMs: nowMs,
    expiresAtMs: null as null,
  };
}

function parseDiscount(raw: unknown): EmoHiEmoooDiscount | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== 'available' && r.status !== 'redeemed') return null;
  return {
    code:
      typeof r.code === 'string' && r.code.trim()
        ? r.code.trim().toUpperCase()
        : HI_EMOOO_PROMO_CODE,
    name:
      typeof r.name === 'string' && r.name.trim()
        ? r.name.trim()
        : HI_EMOOO_PROMO_NAME,
    promoId: typeof r.promoId === 'string' ? r.promoId : HI_EMOOO_REWARD_DOC_ID,
    discountType: 'percent',
    discountValue:
      typeof r.discountValue === 'number' && Number.isFinite(r.discountValue)
        ? r.discountValue
        : HI_EMOOO_PERCENT,
    status: r.status,
    claimedAtMs: typeof r.claimedAtMs === 'number' ? r.claimedAtMs : undefined,
    createdAtMs: typeof r.createdAtMs === 'number' ? r.createdAtMs : undefined,
    expiresAtMs:
      r.expiresAtMs === null
        ? null
        : typeof r.expiresAtMs === 'number'
          ? r.expiresAtMs
          : null,
    redeemedAtMs:
      typeof r.redeemedAtMs === 'number' ? r.redeemedAtMs : undefined,
    redeemedOrderId:
      typeof r.redeemedOrderId === 'string' ? r.redeemedOrderId : undefined,
  };
}

/** Atomic client claim (fallback when callable is unavailable). */
async function claimEmoHiEmoooRewardClient(): Promise<ClaimEmoHiEmoooResult> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid || auth.currentUser?.isAnonymous) {
    throw new Error('Sign in to claim your Hi emooo gift.');
  }

  const userRef = doc(db, 'users', uid);
  const rewardRef = doc(db, 'users', uid, 'emoRewards', HI_EMOOO_REWARD_DOC_ID);
  const memRef = doc(db, 'users', uid, 'emoAiMemory', 'profile');
  const nowMs = Date.now();

  return runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    const rewardSnap = await tx.get(rewardRef);
    const existing = userSnap.data() ?? {};
    const fromUser = parseDiscount(existing.emoHiEmoooDiscount);
    const fromReward = parseDiscount(rewardSnap.data());
    const current = fromReward ?? fromUser;

    if (current?.status === 'available' || current?.status === 'redeemed') {
      return {
        ok: false,
        alreadyClaimed: true,
        reason: 'already_claimed',
        message: HI_EMOOO_ALREADY_CLAIMED_REPLY,
      };
    }

    // Broken prior state: claimed flag without a usable reward → grant once.
    const discount = buildAvailableDiscount(nowMs);

    tx.set(
      userRef,
      {
        emoHiEmoooClaimed: true,
        emoHiEmoooClaimedAt: serverTimestamp(),
        emoHiEmoooDiscount: discount,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      rewardRef,
      {
        ...discount,
        id: HI_EMOOO_REWARD_DOC_ID,
        createdAt: serverTimestamp(),
        expiresAt: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      memRef,
      {
        hiEmoooClaimed: true,
        previousGifts: [HI_EMOOO_PROMO_NAME],
        updatedAtMs: nowMs,
      },
      { merge: true },
    );

    return {
      ok: true,
      alreadyClaimed: false,
      message: HI_EMOOO_SUCCESS_REPLY,
      discount: {
        code: discount.code,
        name: discount.name,
        discountType: 'percent',
        discountValue: HI_EMOOO_PERCENT,
        status: 'available',
      },
    };
  });
}

/**
 * Claim the one-time Hi emooo reward after the exact chat phrase "Hi Emo".
 * Verifies the reward is readable as available before returning success.
 */
export async function claimEmoHiEmoooReward(
  transcript: string,
): Promise<ClaimEmoHiEmoooResult> {
  await syncAuthForFirestoreReads();
  if (!auth.currentUser?.uid || auth.currentUser.isAnonymous) {
    throw new Error('Sign in to claim your Hi emooo gift.');
  }
  if (!isHiEmoChatTrigger(transcript)) {
    return {
      ok: false,
      reason: 'phrase_mismatch',
      message: 'Type “Hi Emo” in our chat to unlock my hidden gift.',
    };
  }

  let result: ClaimEmoHiEmoooResult;
  try {
    const fn = httpsCallable(functions, 'claimEmoHiEmoooReward');
    const res = await fn({ transcript: transcript.trim() });
    result = res.data as ClaimEmoHiEmoooResult;
  } catch {
    result = await claimEmoHiEmoooRewardClient();
  }

  if (result.ok) {
    const uid = auth.currentUser.uid;
    let verified = await loadEmoHiEmoooDiscount(uid);
    if (verified?.status === 'available') return result;

    // Brief wait for eventual consistency, then client write fallback.
    await new Promise((r) => setTimeout(r, 350));
    verified = await loadEmoHiEmoooDiscount(uid);
    if (verified?.status === 'available') return result;

    try {
      await claimEmoHiEmoooRewardClient();
    } catch {
      /* may already exist from server */
    }
    verified = await loadEmoHiEmoooDiscount(uid);
    if (verified?.status === 'available') {
      return {
        ok: true,
        alreadyClaimed: false,
        message: HI_EMOOO_SUCCESS_REPLY,
        discount: {
          code: HI_EMOOO_PROMO_CODE,
          name: HI_EMOOO_PROMO_NAME,
          discountType: 'percent',
          discountValue: HI_EMOOO_PERCENT,
          status: 'available',
        },
      };
    }
    return {
      ok: false,
      reason: 'persist_failed',
      message:
        'Could not save your gift right now. Please try typing “Hi Emo” again.',
    };
  }

  return result;
}

export async function redeemEmoHiEmoooDiscount(orderId: string): Promise<void> {
  await syncAuthForFirestoreReads();
  if (!auth.currentUser?.uid) return;
  try {
    const fn = httpsCallable(functions, 'redeemEmoHiEmoooDiscount');
    await fn({ orderId });
  } catch {
    const uid = auth.currentUser.uid;
    const userRef = doc(db, 'users', uid);
    const rewardRef = doc(db, 'users', uid, 'emoRewards', HI_EMOOO_REWARD_DOC_ID);
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      const rewardSnap = await tx.get(rewardRef);
      const existing = userSnap.data() ?? {};
      const disc =
        parseDiscount(existing.emoHiEmoooDiscount) ??
        parseDiscount(rewardSnap.data());
      if (!disc || disc.status !== 'available') return;
      const redeemed = {
        ...disc,
        status: 'redeemed' as const,
        redeemedAtMs: Date.now(),
        redeemedOrderId: orderId,
      };
      tx.set(
        userRef,
        {
          emoHiEmoooDiscount: redeemed,
          emoHiEmoooRedeemedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(
        rewardRef,
        {
          ...redeemed,
          id: HI_EMOOO_REWARD_DOC_ID,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
  }
}

export async function loadEmoHiEmoooDiscount(
  uid: string | null,
): Promise<EmoHiEmoooDiscount | null> {
  if (!uid?.trim()) return null;
  try {
    const [userSnap, rewardSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'users', uid, 'emoRewards', HI_EMOOO_REWARD_DOC_ID)),
    ]);
    const fromReward = rewardSnap.exists()
      ? parseDiscount(rewardSnap.data())
      : null;
    if (fromReward) return fromReward;
    if (!userSnap.exists()) return null;
    return parseDiscount(userSnap.data()?.emoHiEmoooDiscount);
  } catch {
    return null;
  }
}

/** 50% of food subtotal (matches promoCodes percent math). */
export function computeHiEmoooDiscountAmount(foodSubtotal: number): number {
  if (!(foodSubtotal > 0)) return 0;
  return Math.round(foodSubtotal * (HI_EMOOO_PERCENT / 100) * 100) / 100;
}

export function formatHiEmoooStatusForPrompt(
  discount: EmoHiEmoooDiscount | null,
  claimedFlag?: boolean,
): string {
  if (discount?.status === 'redeemed') {
    return [
      'HI EMOOO GIFT STATUS FOR THIS USER:',
      '- Already claimed / redeemed: YES',
      '- Tell them the one-time Hi emooo gift was already used and cannot be claimed again.',
    ].join('\n');
  }
  if (discount?.status === 'available') {
    return [
      'HI EMOOO GIFT STATUS FOR THIS USER:',
      '- Claimed and waiting to apply at checkout: YES (50% available)',
      '- Tell them the gift is ready and will auto-apply on their next eligible order.',
    ].join('\n');
  }
  if (claimedFlag) {
    return [
      'HI EMOOO GIFT STATUS FOR THIS USER:',
      '- Already claimed / redeemed: YES',
      '- Tell them the one-time Hi emooo gift was already used and cannot be claimed again.',
    ].join('\n');
  }
  return [
    'HI EMOOO GIFT STATUS FOR THIS USER:',
    '- Not claimed yet',
    '- If they ask about gifts/rewards/discounts, tip them: Type "Hi Emo" in our chat to unlock my hidden gift.',
  ].join('\n');
}
