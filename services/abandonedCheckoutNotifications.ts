/**
 * Local notifications for Abandoned Checkout Recovery.
 * Uses existing OS permission only — never prompts.
 */
import { isExpoGo } from '@/constants/runtimeEnvironment';
import type { AbandonedCheckoutConfig } from '@/types/abandonedCheckoutRecovery';
import { db } from '@/services/firebase';
import { ensureAndroidNotificationChannelAsync } from '@/services/notifications';
import * as Notifications from 'expo-notifications';
import { doc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

const NOTIF_ID_PREFIX = 'ho_abandon_';

function notifId(uid: string, orderId: string, kind: 'r1' | 'r2'): string {
  return `${NOTIF_ID_PREFIX}${uid.slice(0, 8)}_${orderId.slice(0, 12)}_${kind}`;
}

async function userAllowsNotifications(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return true;
    return snap.data()?.notificationsEnabled !== false;
  } catch {
    return true;
  }
}

async function hasPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
    const perm = await Notifications.getPermissionsAsync();
    return perm.status === Notifications.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

export async function cancelAbandonedCheckoutNotificationsForOrder(
  orderId: string,
): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(
          (n) =>
            n.identifier.startsWith(NOTIF_ID_PREFIX) &&
            n.identifier.includes(orderId.slice(0, 12)),
        )
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier),
        ),
    );
  } catch {
    /* ignore */
  }
}

export async function cancelAllAbandonedCheckoutNotifications(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(NOTIF_ID_PREFIX))
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier),
        ),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Schedule reminder #1 / #2 for an abandoned unpaid order.
 * Skips if permission denied, notifications disabled, or reminders off.
 */
export async function syncAbandonedCheckoutNotifications(input: {
  uid: string;
  orderId: string;
  restaurantName: string;
  config: AbandonedCheckoutConfig;
  hasOffer: boolean;
  /** Order createdAt ms — used to compute fire times. */
  orderCreatedAtMs?: number;
}): Promise<void> {
  const { uid, orderId, config } = input;
  if (!config.enabled || !config.enableReminderNotifications) {
    await cancelAbandonedCheckoutNotificationsForOrder(orderId);
    return;
  }
  if (Platform.OS === 'web' || isExpoGo) return;
  if (!(await userAllowsNotifications(uid))) {
    await cancelAbandonedCheckoutNotificationsForOrder(orderId);
    return;
  }
  if (!(await hasPermission())) return;

  await ensureAndroidNotificationChannelAsync();

  const created =
    input.orderCreatedAtMs && input.orderCreatedAtMs > 0
      ? input.orderCreatedAtMs
      : Date.now();
  const now = Date.now();

  const schedule = async (
    kind: 'r1' | 'r2',
    fireAtMs: number,
    title: string,
    body: string,
  ) => {
    if (fireAtMs <= now + 10_000) return;
    const id = notifId(uid, orderId, kind);
    try {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        /* ignore */
      }
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title,
          body,
          sound: 'default',
          data: {
            type: 'abandoned_checkout',
            orderId,
            deepLink: `/checkout?orderId=${encodeURIComponent(orderId)}`,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAtMs),
        },
      });
    } catch {
      /* ignore */
    }
  };

  const r1At = created + config.notificationDelay1Minutes * 60 * 1000;
  const r2At = r1At + config.notificationDelay2Minutes * 60 * 1000;

  await schedule(
    'r1',
    r1At,
    config.previewNotificationTitle || '🍔 Your order is still waiting for you.',
    `Complete your order from ${input.restaurantName} before it expires.`,
  );

  await schedule(
    'r2',
    r2At,
    input.hasOffer
      ? config.previewOfferTitle || '🎁 Limited-Time Offer'
      : 'Hungry? Complete your order before it expires.',
    input.hasOffer
      ? config.previewOfferBody ||
          'A limited-time recovery offer is waiting on your order.'
      : `Your order from ${input.restaurantName} is still unpaid.`,
  );
}
