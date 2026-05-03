/** Shown in PaymentSheet (Android requires non-empty merchant name). */
export const STRIPE_MERCHANT_DISPLAY_NAME = 'HalfOrder';

/** Deep link for 3DS / redirect return; must match `scheme` in app.json (`halforder`). */
export const STRIPE_PAYMENT_SHEET_RETURN_URL = 'halforder://stripe-redirect';
