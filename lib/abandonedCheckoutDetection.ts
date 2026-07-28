import type {
  AbandonedCheckoutConfig,
  AbandonedCheckoutOffer,
  AbandonedCheckoutOfferType,
  AbandonedCheckoutSession,
  AbandonedCheckoutUserStats,
} from '@/types/abandonedCheckoutRecovery';
import { computeOrderPricing } from '@/lib/orderPricing';
import { isOrderCompleted } from '@/lib/orderCompletion';

function buildOfferLabel(
  type: AbandonedCheckoutOfferType,
  value: number,
): string {
  switch (type) {
    case 'free_delivery':
      return 'Free Delivery';
    case 'free_service_fee':
      return 'Free Service Fee';
    case 'percent_discount':
      return `${Math.round(value)}% Off`;
    case 'fixed_discount':
      return `$${value.toFixed(2)} Off`;
    case 'reward_points':
      return `${Math.round(value)} Bonus Points`;
    default:
      return 'Recovery Offer';
  }
}

export function isUnpaidAwaitingCheckout(order: {
  paymentStatus?: unknown;
  status?: unknown;
  expired?: unknown;
}): boolean {
  const pay = String(order.paymentStatus ?? '')
    .trim()
    .toLowerCase();
  const status = String(order.status ?? '')
    .trim()
    .toLowerCase();
  if (order.expired === true) return false;
  if (pay === 'paid') return false;
  if (status === 'cancelled' || status === 'canceled') return false;
  return pay === 'unpaid' && status === 'awaiting_payment';
}

export function summarizeAbandonedItems(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return 'Your order';
  const names = items
    .slice(0, 3)
    .map((row) => {
      if (!row || typeof row !== 'object') return '';
      const name = (row as { name?: unknown }).name;
      const qty = (row as { qty?: unknown }).qty;
      const n = typeof name === 'string' ? name.trim() : '';
      if (!n) return '';
      const q =
        typeof qty === 'number' && qty > 1 ? `${Math.floor(qty)}× ` : '';
      return `${q}${n}`;
    })
    .filter(Boolean);
  if (names.length === 0) return 'Your order';
  const extra = items.length > 3 ? ` +${items.length - 3} more` : '';
  return `${names.join(', ')}${extra}`;
}

/** True if customer already placed a successful order after the abandoned one. */
export function hasNewerCompletedOrder(
  abandonedCreatedAtMs: number,
  history: Array<{ createdAtMs: number | null; paymentStatus?: string; status?: string }>,
): boolean {
  return history.some((o) => {
    const ms = o.createdAtMs ?? 0;
    if (ms <= abandonedCreatedAtMs) return false;
    if (String(o.paymentStatus ?? '').toLowerCase() === 'paid') return true;
    return isOrderCompleted(o);
  });
}

export function canGrantRecoveryOffer(input: {
  config: AbandonedCheckoutConfig;
  userStats: AbandonedCheckoutUserStats | null;
  nowMs?: number;
}): boolean {
  const { config, userStats } = input;
  const now = input.nowMs ?? Date.now();
  if (!config.enabled || !config.enableRecoveryOffers) return false;
  if (!config.enableRecoveryAutomation) return false;

  const abandonCount = userStats?.abandonmentCount ?? 0;
  // Never reward the first abandonment — require configurable minimum.
  if (abandonCount < config.minAbandonedCheckoutsBeforeOffer) return false;

  const offersReceived = userStats?.offersReceived ?? 0;
  if (offersReceived >= config.maxOffersPerCustomer) return false;

  const lastOffer = userStats?.lastOfferAtMs ?? 0;
  const cooldownMs = config.cooldownHoursBetweenOffers * 60 * 60 * 1000;
  if (lastOffer > 0 && now - lastOffer < cooldownMs) return false;

  // Suspicious rapid abandon streak without recoveries
  if ((userStats?.suspiciousAbandonStreak ?? 0) >= 5) return false;

  return true;
}

export function buildRecoveryOffer(input: {
  type: AbandonedCheckoutOfferType;
  value: number;
  expiresInMinutes: number;
  nowMs?: number;
}): AbandonedCheckoutOffer {
  const now = input.nowMs ?? Date.now();
  return {
    type: input.type,
    value: input.value,
    label: buildOfferLabel(input.type, input.value),
    expiresAtMs: now + input.expiresInMinutes * 60 * 1000,
    appliedToOrder: false,
    redeemed: false,
  };
}

export function isOfferActive(
  offer: AbandonedCheckoutOffer | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!offer) return false;
  if (offer.redeemed) return false;
  return offer.expiresAtMs > nowMs;
}

/** Apply offer to fee fields; returns new pricing fields for an unpaid order. */
export function applyOfferToOrderPricing(input: {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  promoDiscount: number;
  taxRate: number;
  offer: AbandonedCheckoutOffer;
}): {
  deliveryFee: number;
  serviceFee: number;
  promoDiscount: number;
  totalPrice: number;
  tax: number;
} {
  let deliveryFee = Math.max(0, input.deliveryFee);
  let serviceFee = Math.max(0, input.serviceFee);
  let promoDiscount = Math.max(0, input.promoDiscount);

  switch (input.offer.type) {
    case 'free_delivery':
      deliveryFee = 0;
      break;
    case 'free_service_fee':
      serviceFee = 0;
      break;
    case 'percent_discount': {
      const pct = Math.min(100, Math.max(0, input.offer.value));
      promoDiscount += (input.subtotal * pct) / 100;
      break;
    }
    case 'fixed_discount':
      promoDiscount += Math.max(0, input.offer.value);
      break;
    case 'reward_points':
      // Points credited separately — pricing unchanged.
      break;
    default:
      break;
  }

  const priced = computeOrderPricing({
    foodSubtotal: input.subtotal,
    deliveryFee,
    serviceFee,
    promoDiscount,
    taxRate: input.taxRate,
  });

  return {
    deliveryFee: priced.deliveryFee,
    serviceFee: priced.serviceFee,
    promoDiscount: priced.promoDiscount,
    totalPrice: priced.totalPaid,
    tax: priced.hst,
  };
}

export function sessionNeedsReminder1(
  session: AbandonedCheckoutSession,
  config: AbandonedCheckoutConfig,
  nowMs = Date.now(),
): boolean {
  if (!config.enableReminderNotifications) return false;
  if (session.status !== 'active') return false;
  if (session.reminder1SentAtMs != null) return false;
  const delay = config.notificationDelay1Minutes * 60 * 1000;
  return nowMs - session.createdAtMs >= delay;
}

export function sessionNeedsReminder2(
  session: AbandonedCheckoutSession,
  config: AbandonedCheckoutConfig,
  nowMs = Date.now(),
): boolean {
  if (!config.enableReminderNotifications) return false;
  if (session.status !== 'active') return false;
  if (session.reminder1SentAtMs == null) return false;
  if (session.reminder2SentAtMs != null) return false;
  const delay = config.notificationDelay2Minutes * 60 * 1000;
  return nowMs - session.reminder1SentAtMs >= delay;
}

export function emptyUserStats(uid: string): AbandonedCheckoutUserStats {
  return {
    uid,
    abandonmentCount: 0,
    offersReceived: 0,
    offersRedeemed: 0,
    lastOfferAtMs: null,
    lastAbandonmentAtMs: null,
    suspiciousAbandonStreak: 0,
  };
}
