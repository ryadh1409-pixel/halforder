/**
 * Local iPhone notifications for Repeat Order habits.
 * Uses existing OS permission — never prompts. Respects users.notificationsEnabled.
 * Deterministic ids + day log prevent duplicate habit pings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  RepeatOrderNotifLog,
  RepeatOrderSchedulePlan,
} from '@/types/repeatOrder';
import * as Notifications from 'expo-notifications';
import { doc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

const NOTIF_ID_PREFIX = 'ho_repeat_';
const NOTIF_LOG_PREFIX = '@ourfood/repeat_order_notif_v1:';

function notifIdFor(uid: string, dayKey: string, habitKey: string): string {
  const shortUid = uid.slice(0, 8);
  const safeHabit = habitKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return `${NOTIF_ID_PREFIX}${shortUid}_${dayKey}_${safeHabit}`;
}

function logStorageKey(uid: string): string {
  return `${NOTIF_LOG_PREFIX}${uid}`;
}

function dayHabitKey(dayKey: string, habitKey: string): string {
  return `${dayKey}:${habitKey}`;
}

function parseLogEntry(
  raw: unknown,
): { id: string; fireAtMs: number } | null {
  if (!raw) return null;
  if (typeof raw === 'string' && raw.trim()) {
    return { id: raw.trim(), fireAtMs: 0 };
  }
  if (typeof raw === 'object') {
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const fireAtMs =
      typeof row.fireAtMs === 'number' && Number.isFinite(row.fireAtMs)
        ? row.fireAtMs
        : 0;
    if (!id) return null;
    return { id, fireAtMs };
  }
  return null;
}

async function readNotifLog(uid: string): Promise<RepeatOrderNotifLog> {
  try {
    const raw = await AsyncStorage.getItem(logStorageKey(uid));
    if (!raw) return { uid, sent: {} };
    const parsed = JSON.parse(raw) as {
      uid?: string;
      sent?: Record<string, unknown>;
    };
    if (!parsed || parsed.uid !== uid || typeof parsed.sent !== 'object') {
      return { uid, sent: {} };
    }
    const sent: RepeatOrderNotifLog['sent'] = {};
    for (const [k, v] of Object.entries(parsed.sent ?? {})) {
      const entry = parseLogEntry(v);
      if (entry) sent[k] = entry;
    }
    return { uid, sent };
  } catch {
    return { uid, sent: {} };
  }
}

async function writeNotifLog(log: RepeatOrderNotifLog): Promise<void> {
  try {
    const today = formatLocalDayKey(Date.now());
    const pruned: RepeatOrderNotifLog['sent'] = {};
    for (const [k, v] of Object.entries(log.sent)) {
      const day = k.split(':')[0] ?? '';
      const ageDays =
        (Date.parse(today) - Date.parse(day)) / (24 * 60 * 60 * 1000);
      if (Number.isFinite(ageDays) && ageDays <= 10) pruned[k] = v;
    }
    await AsyncStorage.setItem(
      logStorageKey(log.uid),
      JSON.stringify({ uid: log.uid, sent: pruned }),
    );
  } catch {
    /* best-effort */
  }
}

async function markHabitScheduled(
  uid: string,
  dayKey: string,
  habitKey: string,
  notifId: string,
  fireAtMs: number,
): Promise<void> {
  const log = await readNotifLog(uid);
  log.sent[dayHabitKey(dayKey, habitKey)] = { id: notifId, fireAtMs };
  await writeNotifLog(log);
}

async function clearHabitScheduled(
  uid: string,
  dayKey: string,
  habitKey: string,
): Promise<void> {
  const log = await readNotifLog(uid);
  delete log.sent[dayHabitKey(dayKey, habitKey)];
  await writeNotifLog(log);
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
  await clearHabitScheduled(input.uid, day, input.habitKey);
}

/**
 * Sync local notifications from habit schedule plans.
 * Does not request permission — uses existing grant only.
 * Deterministic identifiers + local day log prevent duplicates for the same habit/day.
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

  const log = await readNotifLog(uid);
  const scheduledIds = new Set<string>();
  const todayKey = formatLocalDayKey(now);

  for (const plan of plans) {
    const orderedHabitToday = userAlreadyOrderedHabitToday({
      history,
      restaurantId: plan.restaurantId,
      itemSignature: plan.itemSignature,
      nowMs: now,
    });
    const orderedRestaurantToday = history.some((h) => {
      if (h.restaurantId !== plan.restaurantId) return false;
      return formatLocalDayKey(h.orderedAtMs) === todayKey;
    });
    if (orderedHabitToday || orderedRestaurantToday) {
      delete log.sent[dayHabitKey(plan.dayKey, plan.habitKey)];
      continue;
    }

    const key = dayHabitKey(plan.dayKey, plan.habitKey);
    const prior = log.sent[key];

    // Already delivered (or overdue) for this habit/day — never notify again today.
    if (prior && prior.fireAtMs > 0 && prior.fireAtMs <= now) {
      continue;
    }

    const fireAtMs =
      prior && prior.fireAtMs > now ? prior.fireAtMs : plan.fireAtMs;
    if (fireAtMs <= now + 10_000) continue;

    const id = prior?.id || notifIdFor(uid, plan.dayKey, plan.habitKey);
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
            dayKey: plan.dayKey,
            deepLink: '/(tabs)/home',
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAtMs),
        },
      });
      scheduledIds.add(id);
      log.sent[key] = { id, fireAtMs };
    } catch {
      /* scheduling failed — skip */
    }
  }

  await writeNotifLog(log);
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
        const habit =
          typeof data.habitKey === 'string' ? data.habitKey : undefined;
        const day = typeof data.dayKey === 'string' ? data.dayKey : dayKey;
        if (habit) await clearHabitScheduled(input.uid, day, habit);
      }
    }
  } catch {
    /* ignore */
  }
}
