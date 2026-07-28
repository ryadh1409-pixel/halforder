/** Abandoned Checkout Recovery — types & defaults (isolated feature). */

export type AbandonedCheckoutOfferType =
  | 'free_delivery'
  | 'free_service_fee'
  | 'percent_discount'
  | 'fixed_discount'
  | 'reward_points';

export type AbandonedCheckoutConfig = {
  /** Master switch. */
  enabled: boolean;
  enableRecoveryAutomation: boolean;
  enablePushNotifications: boolean;
  enableRecoveryOffers: boolean;
  enableReminderNotifications: boolean;
  /** Minutes after unpaid order before first reminder. */
  notificationDelay1Minutes: number;
  /** Minutes after first reminder before second. */
  notificationDelay2Minutes: number;
  /** Never reward first abandonments — min count before offer. */
  minAbandonedCheckoutsBeforeOffer: number;
  offerType: AbandonedCheckoutOfferType;
  /** Percent (0–100), dollars, or points depending on offerType. */
  offerValue: number;
  /** Offer lifetime in minutes. */
  offerExpirationMinutes: number;
  /** Hours between offers for the same customer. */
  cooldownHoursBetweenOffers: number;
  maxOffersPerCustomer: number;
  /** Cap reminder/offer cycles per unpaid order. */
  maxRecoveryAttemptsPerOrder: number;
  previewNotificationTitle: string;
  previewNotificationBody: string;
  previewOfferTitle: string;
  previewOfferBody: string;
};

export const DEFAULT_ABANDONED_CHECKOUT_CONFIG: AbandonedCheckoutConfig = {
  enabled: false,
  enableRecoveryAutomation: true,
  enablePushNotifications: true,
  enableRecoveryOffers: true,
  enableReminderNotifications: true,
  notificationDelay1Minutes: 10,
  notificationDelay2Minutes: 30,
  minAbandonedCheckoutsBeforeOffer: 2,
  offerType: 'free_delivery',
  offerValue: 0,
  offerExpirationMinutes: 60,
  cooldownHoursBetweenOffers: 72,
  maxOffersPerCustomer: 3,
  maxRecoveryAttemptsPerOrder: 2,
  previewNotificationTitle: '🍔 Your order is still waiting for you.',
  previewNotificationBody:
    'Hungry? Complete your order before it expires.',
  previewOfferTitle: '🎁 Limited-Time Offer',
  previewOfferBody: 'Complete your order and unlock a recovery reward.',
};

export type AbandonedCheckoutSessionStatus =
  | 'active'
  | 'recovered'
  | 'expired'
  | 'cancelled';

export type AbandonedCheckoutOffer = {
  type: AbandonedCheckoutOfferType;
  value: number;
  label: string;
  expiresAtMs: number;
  appliedToOrder: boolean;
  redeemed: boolean;
};

export type AbandonedCheckoutSession = {
  orderId: string;
  userId: string;
  restaurantId: string;
  restaurantName: string;
  totalPrice: number;
  itemSummary: string;
  createdAtMs: number;
  status: AbandonedCheckoutSessionStatus;
  reminder1SentAtMs: number | null;
  reminder2SentAtMs: number | null;
  recoveryAttempts: number;
  offer: AbandonedCheckoutOffer | null;
  notificationsOpened: number;
};

export type AbandonedCheckoutAnalytics = {
  abandonedCheckouts: number;
  recoveredOrders: number;
  notificationsSent: number;
  notificationsOpened: number;
  offersGenerated: number;
  offersRedeemed: number;
  /** Sum of recovery durations (ms) for averaging. */
  totalRecoveryTimeMs: number;
  recoveredWithTimingCount: number;
};

export const EMPTY_ABANDONED_CHECKOUT_ANALYTICS: AbandonedCheckoutAnalytics = {
  abandonedCheckouts: 0,
  recoveredOrders: 0,
  notificationsSent: 0,
  notificationsOpened: 0,
  offersGenerated: 0,
  offersRedeemed: 0,
  totalRecoveryTimeMs: 0,
  recoveredWithTimingCount: 0,
};

export type AbandonedCheckoutUserStats = {
  uid: string;
  abandonmentCount: number;
  offersReceived: number;
  offersRedeemed: number;
  lastOfferAtMs: number | null;
  lastAbandonmentAtMs: number | null;
  /** Rolling window abuse signal. */
  suspiciousAbandonStreak: number;
};

export type AbandonedCheckoutHomeCard = {
  orderId: string;
  restaurantName: string;
  itemSummary: string;
  totalPrice: number;
  offer: AbandonedCheckoutOffer | null;
  offerSecondsRemaining: number | null;
};
