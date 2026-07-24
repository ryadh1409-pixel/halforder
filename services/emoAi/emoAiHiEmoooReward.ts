/**
 * Client helpers for the Hi emooo Easter Egg reward.
 */
import { httpsCallable } from 'firebase/functions';

import { auth, db, functions, syncAuthForFirestoreReads } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const HI_EMOOO_PROMO_CODE = 'HI EMOOO';
export const HI_EMOOO_PROMO_NAME = 'Hi emooo';
export const HI_EMOOO_PERCENT = 50;
/** Must match server shout threshold (expo-av metering dB). */
export const HI_EMOOO_SHOUT_THRESHOLD_DB = -18;

export type EmoHiEmoooDiscount = {
  code: string;
  name: string;
  promoId?: string;
  discountType: 'percent';
  discountValue: number;
  status: 'available' | 'redeemed';
  claimedAtMs?: number;
  redeemedAtMs?: number;
  redeemedOrderId?: string;
};

export type ClaimEmoHiEmoooResult = {
  ok: boolean;
  alreadyClaimed?: boolean;
  reason?: string;
  message: string;
  transcript?: string;
  discount?: {
    code: string;
    name: string;
    discountType: 'percent';
    discountValue: number;
    status: 'available';
  };
};

export function matchesHiEmoPhrase(raw: string): boolean {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return false;
  return (
    /\b(hi|hey|high)\s*emo+\b/.test(cleaned) ||
    /\bhiemo+\b/.test(cleaned.replace(/\s/g, ''))
  );
}

export async function claimEmoHiEmoooReward(input: {
  peakVolumeDb: number;
  transcript?: string;
  audioBase64?: string;
  mimeType?: string;
}): Promise<ClaimEmoHiEmoooResult> {
  await syncAuthForFirestoreReads();
  if (!auth.currentUser?.uid || auth.currentUser.isAnonymous) {
    throw new Error('Sign in to claim your Hi emooo gift.');
  }
  const fn = httpsCallable(functions, 'claimEmoHiEmoooReward');
  const result = await fn({
    peakVolumeDb: input.peakVolumeDb,
    transcript: input.transcript ?? '',
    audioBase64: input.audioBase64 ?? '',
    mimeType: input.mimeType ?? 'audio/m4a',
  });
  return result.data as ClaimEmoHiEmoooResult;
}

export async function redeemEmoHiEmoooDiscount(orderId: string): Promise<void> {
  await syncAuthForFirestoreReads();
  if (!auth.currentUser?.uid) return;
  const fn = httpsCallable(functions, 'redeemEmoHiEmoooDiscount');
  await fn({ orderId });
}

export async function loadEmoHiEmoooDiscount(
  uid: string | null,
): Promise<EmoHiEmoooDiscount | null> {
  if (!uid?.trim()) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const raw = snap.data()?.emoHiEmoooDiscount;
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const status = r.status === 'redeemed' ? 'redeemed' : 'available';
    const discountValue =
      typeof r.discountValue === 'number' && Number.isFinite(r.discountValue)
        ? r.discountValue
        : HI_EMOOO_PERCENT;
    return {
      code:
        typeof r.code === 'string' && r.code.trim()
          ? r.code.trim().toUpperCase()
          : HI_EMOOO_PROMO_CODE,
      name:
        typeof r.name === 'string' && r.name.trim()
          ? r.name.trim()
          : HI_EMOOO_PROMO_NAME,
      promoId: typeof r.promoId === 'string' ? r.promoId : undefined,
      discountType: 'percent',
      discountValue,
      status,
      claimedAtMs:
        typeof r.claimedAtMs === 'number' ? r.claimedAtMs : undefined,
      redeemedAtMs:
        typeof r.redeemedAtMs === 'number' ? r.redeemedAtMs : undefined,
      redeemedOrderId:
        typeof r.redeemedOrderId === 'string' ? r.redeemedOrderId : undefined,
    };
  } catch {
    return null;
  }
}

/** 50% of food subtotal (matches promoCodes percent math). */
export function computeHiEmoooDiscountAmount(foodSubtotal: number): number {
  if (!(foodSubtotal > 0)) return 0;
  return Math.round(foodSubtotal * (HI_EMOOO_PERCENT / 100) * 100) / 100;
}
