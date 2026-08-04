/**
 * Flat $1 food-share / swipe card promotion — target which participant(s) receive it.
 * Additive fields on adminFoodShares; does not replace badge promos.
 */

export const FOOD_SHARE_DOLLAR_PROMO_AMOUNT = 1;

export type FoodShareDollarPromoTarget = 'first' | 'second' | 'both';

export const FOOD_SHARE_DOLLAR_PROMO_TARGET_OPTIONS: ReadonlyArray<{
  value: FoodShareDollarPromoTarget;
  label: string;
}> = [
  { value: 'first', label: 'First User' },
  { value: 'second', label: 'Second User' },
  { value: 'both', label: 'Both Users' },
];

export function parseFoodShareDollarPromoTarget(
  raw: unknown,
): FoodShareDollarPromoTarget {
  if (raw === 'first' || raw === 'second' || raw === 'both') return raw;
  return 'both';
}

export function isFoodShareDollarPromoEnabled(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === 'true';
}

/**
 * Returns $1 or $0 for the paying participant.
 * `participant`: first = match.users[0] / userA; second = match.users[1] / userB.
 */
export function resolveFoodShareDollarPromoDiscount(input: {
  enabled: boolean;
  target: FoodShareDollarPromoTarget;
  participant: 'first' | 'second' | null;
}): number {
  if (!input.enabled || input.participant == null) return 0;
  if (input.target === 'both') return FOOD_SHARE_DOLLAR_PROMO_AMOUNT;
  if (input.target === input.participant) return FOOD_SHARE_DOLLAR_PROMO_AMOUNT;
  return 0;
}

export function resolveMatchParticipantRole(
  uid: string,
  users: unknown,
): 'first' | 'second' | null {
  if (!Array.isArray(users) || typeof uid !== 'string' || !uid.trim()) {
    return null;
  }
  if (users[0] === uid) return 'first';
  if (users[1] === uid) return 'second';
  return null;
}
