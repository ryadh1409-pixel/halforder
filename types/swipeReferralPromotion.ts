export const SWIPE_REFERRAL_PROMO_SETTINGS_DOC = 'swipeReferralPromotions';

export type SwipeReferralPromotion = {
  id: string;
  name: string;
  /** Percent off, e.g. 50. */
  discountPercent: number;
  startAtMs: number | null;
  endAtMs: number | null;
  active: boolean;
  maxRedemptions: number | null;
  /** Admin food share card slot ids. */
  cardIds: string[];
  /** Badge copy shown on swipe cards. */
  badgeText: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SwipeReferralPromotionAnalytics = {
  invitationsSent: number;
  successfulReferrals: number;
  rewardsIssued: number;
  rewardsRedeemed: number;
  conversionRate: number;
};

export function isSwipeReferralPromotionLive(
  promo: SwipeReferralPromotion,
  nowMs = Date.now(),
): boolean {
  if (!promo.active) return false;
  if (promo.startAtMs != null && nowMs < promo.startAtMs) return false;
  if (promo.endAtMs != null && nowMs > promo.endAtMs) return false;
  return true;
}

export function defaultSwipeReferralBadgeText(percent: number): string {
  const p = Math.round(percent);
  return `🔥 Invite a Friend & Get ${p}% OFF`;
}
