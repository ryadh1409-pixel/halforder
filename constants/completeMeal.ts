/** Complete My Meal — shared constants (client + docs). */

/**
 * Checkout entry for Complete My Meal.
 * When false, Checkout only shows Pay Full Amount. The feature, screens,
 * backend, and invitation flow remain intact and can be re-enabled later.
 */
export const COMPLETE_MEAL_CHECKOUT_ENTRY_ENABLED = false;

/** Minimum the order owner must pay when starting a campaign (CAD cents). */
export const COMPLETE_MEAL_MIN_OWNER_CENTS = 500;

/** Minimum any single contribution (Stripe floor). */
export const COMPLETE_MEAL_MIN_CONTRIBUTION_CENTS = 50;

/** Quick-pay presets shown to friends (CAD dollars). */
export const COMPLETE_MEAL_PRESET_DOLLARS = [5, 10] as const;

export const COMPLETE_MEAL_COLLECTION = 'completeMealCampaigns';
export const COMPLETE_MEAL_PAYMENTS_COLLECTION = 'completeMealPayments';

export const COMPLETE_MEAL_FEATURE = 'complete_my_meal' as const;
