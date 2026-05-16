/** Checkout UX modes (premium screen exposes Delivery + Pickup only). */
export type CheckoutFulfillmentMode = 'delivery' | 'pickup';

/** Timing tiles — maps to pricing in `checkout-premium` screen logic. */
export type CheckoutDeliveryTiming = 'priority' | 'standard' | 'scheduled';

/** Mock payment snapshot — swap for Stripe Customer + Firestore wallet docs. */
export type CheckoutPaymentMethodPreview = {
  id: string;
  brand: 'visa' | 'mastercard' | 'amex' | 'generic';
  last4: string;
  cardholderName: string;
  /** e.g. "12/28" */
  expiryLabel: string;
  isDefault?: boolean;
};

export type CheckoutAddressDraft = {
  formatted: string;
  line2?: string;
  phoneFormatted?: string;
  deliveryInstructions?: string;
};

export type CheckoutPriceLine = {
  key: string;
  label: string;
  /** Right column */
  value: string;
  strikethrough?: boolean;
  /** Green savings / promo */
  emphasizeSave?: boolean;
  /** Danger / discount row */
  emphasizeDiscount?: boolean;
  /** Tiny pill left of value (optional) */
  badge?: string;
};

/** Dev / analytics default row — hydrate from Stripe + users/{uid}/wallet. */
export const CHECKOUT_MOCK_DEFAULT_PAYMENT: CheckoutPaymentMethodPreview = {
  id: 'pm_mock_default',
  brand: 'visa',
  last4: '4242',
  cardholderName: 'Alex M.',
  expiryLabel: '12/28',
  isDefault: true,
};
