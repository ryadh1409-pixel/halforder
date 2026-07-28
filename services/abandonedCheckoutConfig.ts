import {
  DEFAULT_ABANDONED_CHECKOUT_CONFIG,
  EMPTY_ABANDONED_CHECKOUT_ANALYTICS,
  type AbandonedCheckoutAnalytics,
  type AbandonedCheckoutConfig,
  type AbandonedCheckoutOfferType,
} from '@/types/abandonedCheckoutRecovery';
import { db } from '@/services/firebase';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export const ABANDONED_CHECKOUT_CONFIG_PATH =
  'platformSettings/abandonedCheckoutRecovery';
export const ABANDONED_CHECKOUT_ANALYTICS_PATH =
  'platformSettings/abandonedCheckoutAnalytics';

function clampNum(n: unknown, fallback: number, min: number, max: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

function parseOfferType(raw: unknown): AbandonedCheckoutOfferType {
  switch (raw) {
    case 'free_delivery':
    case 'free_service_fee':
    case 'percent_discount':
    case 'fixed_discount':
    case 'reward_points':
      return raw;
    default:
      return DEFAULT_ABANDONED_CHECKOUT_CONFIG.offerType;
  }
}

export function parseAbandonedCheckoutConfig(
  raw: Record<string, unknown> | null | undefined,
): AbandonedCheckoutConfig {
  const d = raw ?? {};
  return {
    enabled: d.enabled === true,
    enableRecoveryAutomation: d.enableRecoveryAutomation !== false,
    enablePushNotifications: d.enablePushNotifications !== false,
    enableRecoveryOffers: d.enableRecoveryOffers !== false,
    enableReminderNotifications: d.enableReminderNotifications !== false,
    notificationDelay1Minutes: clampNum(
      d.notificationDelay1Minutes,
      DEFAULT_ABANDONED_CHECKOUT_CONFIG.notificationDelay1Minutes,
      1,
      24 * 60,
    ),
    notificationDelay2Minutes: clampNum(
      d.notificationDelay2Minutes,
      DEFAULT_ABANDONED_CHECKOUT_CONFIG.notificationDelay2Minutes,
      1,
      24 * 60,
    ),
    minAbandonedCheckoutsBeforeOffer: clampNum(
      d.minAbandonedCheckoutsBeforeOffer,
      DEFAULT_ABANDONED_CHECKOUT_CONFIG.minAbandonedCheckoutsBeforeOffer,
      2,
      20,
    ),
    offerType: parseOfferType(d.offerType),
    offerValue: clampNum(
      d.offerValue,
      DEFAULT_ABANDONED_CHECKOUT_CONFIG.offerValue,
      0,
      10_000,
    ),
    offerExpirationMinutes: clampNum(
      d.offerExpirationMinutes,
      DEFAULT_ABANDONED_CHECKOUT_CONFIG.offerExpirationMinutes,
      5,
      7 * 24 * 60,
    ),
    cooldownHoursBetweenOffers: clampNum(
      d.cooldownHoursBetweenOffers,
      DEFAULT_ABANDONED_CHECKOUT_CONFIG.cooldownHoursBetweenOffers,
      1,
      720,
    ),
    maxOffersPerCustomer: clampNum(
      d.maxOffersPerCustomer,
      DEFAULT_ABANDONED_CHECKOUT_CONFIG.maxOffersPerCustomer,
      1,
      50,
    ),
    maxRecoveryAttemptsPerOrder: clampNum(
      d.maxRecoveryAttemptsPerOrder,
      DEFAULT_ABANDONED_CHECKOUT_CONFIG.maxRecoveryAttemptsPerOrder,
      1,
      5,
    ),
    previewNotificationTitle:
      typeof d.previewNotificationTitle === 'string' &&
      d.previewNotificationTitle.trim()
        ? d.previewNotificationTitle.trim()
        : DEFAULT_ABANDONED_CHECKOUT_CONFIG.previewNotificationTitle,
    previewNotificationBody:
      typeof d.previewNotificationBody === 'string' &&
      d.previewNotificationBody.trim()
        ? d.previewNotificationBody.trim()
        : DEFAULT_ABANDONED_CHECKOUT_CONFIG.previewNotificationBody,
    previewOfferTitle:
      typeof d.previewOfferTitle === 'string' && d.previewOfferTitle.trim()
        ? d.previewOfferTitle.trim()
        : DEFAULT_ABANDONED_CHECKOUT_CONFIG.previewOfferTitle,
    previewOfferBody:
      typeof d.previewOfferBody === 'string' && d.previewOfferBody.trim()
        ? d.previewOfferBody.trim()
        : DEFAULT_ABANDONED_CHECKOUT_CONFIG.previewOfferBody,
  };
}

export function parseAbandonedCheckoutAnalytics(
  raw: Record<string, unknown> | null | undefined,
): AbandonedCheckoutAnalytics {
  const d = raw ?? {};
  const num = (k: keyof AbandonedCheckoutAnalytics) =>
    typeof d[k] === 'number' && Number.isFinite(d[k] as number)
      ? Math.max(0, d[k] as number)
      : EMPTY_ABANDONED_CHECKOUT_ANALYTICS[k];
  return {
    abandonedCheckouts: num('abandonedCheckouts'),
    recoveredOrders: num('recoveredOrders'),
    notificationsSent: num('notificationsSent'),
    notificationsOpened: num('notificationsOpened'),
    offersGenerated: num('offersGenerated'),
    offersRedeemed: num('offersRedeemed'),
    totalRecoveryTimeMs: num('totalRecoveryTimeMs'),
    recoveredWithTimingCount: num('recoveredWithTimingCount'),
  };
}

export async function getAbandonedCheckoutConfig(): Promise<AbandonedCheckoutConfig> {
  try {
    const snap = await getDoc(doc(db, 'platformSettings', 'abandonedCheckoutRecovery'));
    if (!snap.exists()) return { ...DEFAULT_ABANDONED_CHECKOUT_CONFIG };
    return parseAbandonedCheckoutConfig(snap.data() as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_ABANDONED_CHECKOUT_CONFIG };
  }
}

export function subscribeAbandonedCheckoutConfig(
  onData: (config: AbandonedCheckoutConfig) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'platformSettings', 'abandonedCheckoutRecovery'),
    (snap) => {
      onData(
        snap.exists()
          ? parseAbandonedCheckoutConfig(snap.data() as Record<string, unknown>)
          : { ...DEFAULT_ABANDONED_CHECKOUT_CONFIG },
      );
    },
    (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
  );
}

export function subscribeAbandonedCheckoutAnalytics(
  onData: (analytics: AbandonedCheckoutAnalytics) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'platformSettings', 'abandonedCheckoutAnalytics'),
    (snap) => {
      onData(
        snap.exists()
          ? parseAbandonedCheckoutAnalytics(
              snap.data() as Record<string, unknown>,
            )
          : { ...EMPTY_ABANDONED_CHECKOUT_ANALYTICS },
      );
    },
    (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
  );
}

export async function saveAbandonedCheckoutConfig(
  config: AbandonedCheckoutConfig,
): Promise<void> {
  const parsed = parseAbandonedCheckoutConfig(config as unknown as Record<string, unknown>);
  await setDoc(
    doc(db, 'platformSettings', 'abandonedCheckoutRecovery'),
    {
      ...parsed,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function formatOfferTypeLabel(type: AbandonedCheckoutOfferType): string {
  switch (type) {
    case 'free_delivery':
      return 'Free Delivery';
    case 'free_service_fee':
      return 'Free Service Fee';
    case 'percent_discount':
      return 'Percentage Discount';
    case 'fixed_discount':
      return 'Fixed Dollar Discount';
    case 'reward_points':
      return 'Reward Points';
    default:
      return 'Offer';
  }
}

export function buildOfferLabel(
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
