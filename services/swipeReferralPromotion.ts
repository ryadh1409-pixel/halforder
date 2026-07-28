import { auth, db } from '@/services/firebase';
import {
  defaultSwipeReferralBadgeText,
  isSwipeReferralPromotionLive,
  SWIPE_REFERRAL_PROMO_SETTINGS_DOC,
  type SwipeReferralPromotion,
  type SwipeReferralPromotionAnalytics,
} from '@/types/swipeReferralPromotion';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

const settingsRef = () =>
  doc(db, 'platformSettings', SWIPE_REFERRAL_PROMO_SETTINGS_DOC);

function parsePromo(
  id: string,
  raw: Record<string, unknown>,
): SwipeReferralPromotion {
  const cardIds = Array.isArray(raw.cardIds)
    ? raw.cardIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const discountPercent =
    typeof raw.discountPercent === 'number' && Number.isFinite(raw.discountPercent)
      ? Math.max(1, Math.min(100, raw.discountPercent))
      : 50;
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name.trim() : 'Referral Reward',
    discountPercent,
    startAtMs: typeof raw.startAtMs === 'number' ? raw.startAtMs : null,
    endAtMs: typeof raw.endAtMs === 'number' ? raw.endAtMs : null,
    active: raw.active === true,
    maxRedemptions:
      typeof raw.maxRedemptions === 'number' && Number.isFinite(raw.maxRedemptions)
        ? Math.max(0, Math.floor(raw.maxRedemptions))
        : null,
    cardIds,
    badgeText:
      typeof raw.badgeText === 'string' && raw.badgeText.trim()
        ? raw.badgeText.trim()
        : defaultSwipeReferralBadgeText(discountPercent),
    createdAtMs: typeof raw.createdAtMs === 'number' ? raw.createdAtMs : 0,
    updatedAtMs: typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : 0,
  };
}

function parseCatalog(
  data: Record<string, unknown> | undefined,
): SwipeReferralPromotion[] {
  const map = data?.promotions;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
  const out: SwipeReferralPromotion[] = [];
  for (const [id, value] of Object.entries(map as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    out.push(parsePromo(id, value as Record<string, unknown>));
  }
  out.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return out;
}

export function subscribeSwipeReferralPromotions(
  onData: (rows: SwipeReferralPromotion[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    settingsRef(),
    (snap) => {
      onData(parseCatalog(snap.data() as Record<string, unknown> | undefined));
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load promotions'));
      onData([]);
    },
  );
}

export function subscribeLiveSwipeReferralPromotions(
  onData: (rows: SwipeReferralPromotion[]) => void,
): Unsubscribe {
  return subscribeSwipeReferralPromotions((rows) => {
    onData(rows.filter((p) => isSwipeReferralPromotionLive(p)));
  });
}

export function findLivePromoForCard(
  promos: SwipeReferralPromotion[],
  adminFoodShareId: string,
): SwipeReferralPromotion | null {
  const id = adminFoodShareId.trim();
  if (!id) return null;
  return (
    promos.find(
      (p) => isSwipeReferralPromotionLive(p) && p.cardIds.includes(id),
    ) ?? null
  );
}

/** One-shot lookup for invite tagging (client). */
export async function loadLivePromoForCard(
  adminFoodShareId: string,
): Promise<SwipeReferralPromotion | null> {
  try {
    const snap = await getDoc(settingsRef());
    const rows = parseCatalog(snap.data() as Record<string, unknown> | undefined);
    return findLivePromoForCard(rows, adminFoodShareId);
  } catch {
    return null;
  }
}

export async function saveSwipeReferralPromotion(input: {
  id?: string;
  name: string;
  discountPercent: number;
  startAtMs: number | null;
  endAtMs: number | null;
  active: boolean;
  maxRedemptions: number | null;
  cardIds: string[];
  badgeText?: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');

  const name = input.name.trim();
  if (!name) throw new Error('Promotion name is required');
  const discountPercent = Math.max(
    1,
    Math.min(100, Math.round(input.discountPercent)),
  );
  const cardIds = [...new Set(input.cardIds.map((c) => c.trim()).filter(Boolean))];
  if (cardIds.length === 0) {
    throw new Error('Select at least one Swipe Delivery card');
  }

  const id =
    input.id?.trim() ||
    `srr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const snap = await getDoc(settingsRef());
  const existing = (snap.data()?.promotions ?? {}) as Record<string, unknown>;
  const prev = (existing[id] ?? {}) as Record<string, unknown>;
  const now = Date.now();

  const next: SwipeReferralPromotion = {
    id,
    name,
    discountPercent,
    startAtMs: input.startAtMs,
    endAtMs: input.endAtMs,
    active: input.active === true,
    maxRedemptions: input.maxRedemptions,
    cardIds,
    badgeText:
      input.badgeText?.trim() || defaultSwipeReferralBadgeText(discountPercent),
    createdAtMs: typeof prev.createdAtMs === 'number' ? prev.createdAtMs : now,
    updatedAtMs: now,
  };

  await setDoc(
    settingsRef(),
    {
      promotions: {
        ...existing,
        [id]: next,
      },
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true },
  );
  return id;
}

export async function setSwipeReferralPromotionActive(
  id: string,
  active: boolean,
): Promise<void> {
  const snap = await getDoc(settingsRef());
  const existing = (snap.data()?.promotions ?? {}) as Record<string, unknown>;
  const prev = existing[id];
  if (!prev || typeof prev !== 'object') throw new Error('Promotion not found');
  await setDoc(
    settingsRef(),
    {
      promotions: {
        ...existing,
        [id]: {
          ...(prev as object),
          active,
          updatedAtMs: Date.now(),
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteSwipeReferralPromotion(id: string): Promise<void> {
  const snap = await getDoc(settingsRef());
  const existing = {
    ...((snap.data()?.promotions ?? {}) as Record<string, unknown>),
  };
  delete existing[id];
  await setDoc(
    settingsRef(),
    {
      promotions: existing,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadSwipeReferralPromotionAnalytics(
  promoId: string,
): Promise<SwipeReferralPromotionAnalytics> {
  const id = promoId.trim();
  if (!id) {
    return {
      invitationsSent: 0,
      successfulReferrals: 0,
      rewardsIssued: 0,
      rewardsRedeemed: 0,
      conversionRate: 0,
    };
  }

  let invitationsSent = 0;
  let successfulReferrals = 0;
  try {
    const inviteSnap = await getDocs(
      query(
        collection(db, 'foodShareInvites'),
        where('referralPromoId', '==', id),
      ),
    );
    invitationsSent = inviteSnap.size;
    successfulReferrals = inviteSnap.docs.filter(
      (d) => d.data()?.convertedAt != null,
    ).length;
  } catch {
    /* admin list / index may be missing */
  }

  let rewardsIssued = 0;
  let rewardsRedeemed = 0;
  try {
    const rewardSnap = await getDocs(
      query(
        collection(db, 'promoCodes'),
        where('swipeReferralPromoId', '==', id),
      ),
    );
    rewardsIssued = rewardSnap.size;
    rewardsRedeemed = rewardSnap.docs.filter((d) => {
      const used = d.data()?.usedCount;
      return typeof used === 'number' && used > 0;
    }).length;
  } catch {
    /* ignore */
  }

  const conversionRate =
    invitationsSent > 0
      ? Math.round((successfulReferrals / invitationsSent) * 1000) / 10
      : 0;

  return {
    invitationsSent,
    successfulReferrals,
    rewardsIssued,
    rewardsRedeemed,
    conversionRate,
  };
}
