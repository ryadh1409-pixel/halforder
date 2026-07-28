/**
 * Local iPhone notifications for Repeat Order habits.
 * Uses existing OS permission — never prompts. Respects users.notificationsEnabled.
 */
import { isExpoGo } from '@/constants/runtimeEnvironment';
import {
  formatLocalDayKey,
  pickRepeatNotificationCopy,
  userAlreadyOrderedHabitToday,
} from '@/lib/repeatOrderDetection';
import { db } from '@/services/firebase';
import { ensureAndroidNotificationChannelAsync } from '@/services/notifications';
import type {
  RepeatOrderHistoryEntry,
  RepeatOrderSchedulePlan,
} from '@/types/repeatOrder';
import * as Notifications from 'expo-notifications';
import { doc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

const NOTIF_ID_PREFIX = 'ho_repeat_';

function notifIdFor(uid: string, dayKey: string, habitKey: string): string {
  const shortUid = uid.slice(0, 8);
  const safeHabit = habitKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return `${NOTIF_ID_PREFIX}${shortUid}_${dayKey}_${safeHabit}`;
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

async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
    const perm = await Notifications.getPermissionsAsync();
    return perm.status === Notifications.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

/** Cancel every scheduled Repeat Order notification for this device. */
export async function cancelAllRepeatOrderNotifications(): Promise<void> {
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

export async function cancelRepeatOrderNotificationsForHabit(input: {
  uid: string;
  habitKey: string;
  dayKey?: string;
}): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  const day = input.dayKey ?? formatLocalDayKey(Date.now());
  const id = notifIdFor(input.uid, day, input.habitKey);
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* ignore */
  }
}

/**
 * Sync local notifications from habit schedule plans.
 * Does not request permission — uses existing grant only.
 * Deterministic identifiers prevent duplicates for the same habit/day.
 */
export async function syncRepeatOrderNotifications(input: {
  uid: string;
  plans: RepeatOrderSchedulePlan[];
  history: RepeatOrderHistoryEntry[];
  nowMs?: number;
}): Promise<void> {
  const { uid, plans, history } = input;
  const now = input.nowMs ?? Date.now();
  if (!uid.trim() || Platform.OS === 'web' || isExpoGo) return;

  const allowed = await userAllowsNotifications(uid);
  if (!allowed) {
    await cancelAllRepeatOrderNotifications();
    return;
  }

  const granted = await hasNotificationPermission();
  if (!granted) return;

  await ensureAndroidNotificationChannelAsync();
  await cancelAllRepeatOrderNotifications();

  const scheduledIds = new Set<string>();

  for (const plan of plans) {
    const orderedHabitToday = userAlreadyOrderedHabitToday({
      history,
      restaurantId: plan.restaurantId,
      itemSignature: plan.itemSignature,
      nowMs: now,
    });
    const orderedRestaurantToday = history.some((h) => {
      if (h.restaurantId !== plan.restaurantId) return false;
      return formatLocalDayKey(h.orderedAtMs) === formatLocalDayKey(now);
    });
    if (orderedHabitToday || orderedRestaurantToday) continue;
    if (plan.fireAtMs <= now + 15_000) continue;

    const id = notifIdFor(uid, plan.dayKey, plan.habitKey);
    if (scheduledIds.has(id)) continue;
    const copy = pickRepeatNotificationCopy(plan);

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: copy.title,
          body: copy.body,
          sound: 'default',
          data: {
            type: 'repeat_order',
            habitKey: plan.habitKey,
            restaurantId: plan.restaurantId,
            deepLink: '/(tabs)/home',
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(plan.fireAtMs),
        },
      });
      scheduledIds.add(id);
    } catch {
      /* scheduling failed — skip */
    }
  }
}

/**
 * After the user places / rebuilds a usual order — cancel today's habit ping.
 */
export async function onRepeatOrderPlacedCancelNotifications(input: {
  uid: string;
  restaurantId: string;
  habitKey?: string;
}): Promise<void> {
  const dayKey = formatLocalDayKey(Date.now());
  if (input.habitKey) {
    await cancelRepeatOrderNotificationsForHabit({
      uid: input.uid,
      habitKey: input.habitKey,
      dayKey,
    });
  }
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (!n.identifier.startsWith(NOTIF_ID_PREFIX)) continue;
      const data = n.content.data as Record<string, unknown> | undefined;
      if (data?.restaurantId === input.restaurantId) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    /* ignore */
  }
}
