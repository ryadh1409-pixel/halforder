/** Complete My Meal — shared constants (client + docs). */

/** Minimum the order owner must pay when starting a campaign (CAD cents). */
export const COMPLETE_MEAL_MIN_OWNER_CENTS = 500;

/** Minimum any single contribution (Stripe floor). */
export const COMPLETE_MEAL_MIN_CONTRIBUTION_CENTS = 50;

/** Quick-pay presets shown to friends (CAD dollars). */
export const COMPLETE_MEAL_PRESET_DOLLARS = [5, 10] as const;

export const COMPLETE_MEAL_COLLECTION = 'completeMealCampaigns';
export const COMPLETE_MEAL_PAYMENTS_COLLECTION = 'completeMealPayments';

export const COMPLETE_MEAL_FEATURE = 'complete_my_meal' as const;
