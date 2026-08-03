/**
 * Canonical critical order alarm engine (admin / restaurant / driver).
 *
 * Apple-compliant behavior (no Critical Alerts entitlement):
 * - Looping in-app audio while the alert is active and the app process can play sound
 * - At most ONE local notification when starting from background (banner/lock-screen cue)
 * - Remote push carries the custom bundled sound for killed/suspended wake
 * - Never repeatedly schedule local notifications (App Store / UX risk)
 * - Auto-stop after timeout; explicit ack stops immediately
 */
import {
  CRITICAL_ORDER_CHANNEL_ID,
  CRITICAL_ORDER_SOUND_NAME,
  criticalOrderAlertKey,
  type OrderAlertEvent,
  type OrderAlertRole,
} from '@/constants/criticalOrderAlert';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus, Platform } from 'react-native';

export type { OrderAlertEvent, OrderAlertRole };
export type CriticalOrderAlertInput = {
  role: OrderAlertRole;
  event: OrderAlertEvent;
  orderId: string;
  title: string;
  body: string;
  /** Auto-stop after this many ms (default 5 minutes). */
  timeoutMs?: number;
  /**
   * When false, skip the one-shot local notification (e.g. remote push already
   * presented an OS banner). Defaults to true only when app is not active.
   */
  presentLocalNotification?: boolean;
};

export type CriticalOrderAlertKey = string;

const ALERT_SOUND = require('@/assets/sounds/order_critical_alert.wav');
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export { CRITICAL_ORDER_CHANNEL_ID, CRITICAL_ORDER_SOUND_NAME, criticalOrderAlertKey };

type ActiveAlert = {
  key: CriticalOrderAlertKey;
  input: CriticalOrderAlertInput;
  sound: Audio.Sound | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  localNotificationIds: string[];
  startedAt: number;
};

const active = new Map<CriticalOrderAlertKey, ActiveAlert>();
let appStateSub: { remove: () => void } | null = null;

function logOrderAlert(fields: Record<string, unknown>): void {
  console.log('[ORDER ALERT]', {
    ...fields,
    timestamp: Date.now(),
    file: 'services/orderCriticalAlert.ts',
  });
}

function ensureAppStateWatch(): void {
  if (appStateSub || Platform.OS === 'web') return;
  appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next !== 'active') return;
    // Resume looping audio when returning to foreground with an active alert.
    for (const entry of active.values()) {
      if (!entry.sound) {
        void playLoopingSound(entry);
      } else {
        void entry.sound.playAsync().catch(() => undefined);
      }
    }
  });
}

async function ensureCriticalAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CRITICAL_ORDER_CHANNEL_ID, {
    name: 'Critical Orders',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    lightColor: '#EF4444',
    sound: CRITICAL_ORDER_SOUND_NAME,
    enableVibrate: true,
    bypassDnd: false,
  });
}

async function playLoopingSound(entry: ActiveAlert): Promise<boolean> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      // Do not claim indefinite background audio (needs UIBackgroundModes audio
      // and can fail App Store review if used as a notification spam substitute).
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    if (entry.sound) {
      try {
        await entry.sound.unloadAsync();
      } catch {
        /* ignore */
      }
      entry.sound = null;
    }
    const { sound } = await Audio.Sound.createAsync(ALERT_SOUND, {
      shouldPlay: true,
      isLooping: true,
      volume: 1.0,
    });
    entry.sound = sound;
    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish && !status.isLooping) {
        void sound.replayAsync().catch(() => undefined);
      }
    });
    return true;
  } catch (e) {
    logOrderAlert({
      role: entry.input.role,
      event: entry.input.event,
      orderId: entry.input.orderId,
      soundPlayed: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/** One-shot local banner — never called on a timer. */
async function presentOneShotLocalNotification(
  entry: ActiveAlert,
): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== Notifications.PermissionStatus.GRANTED) {
      return false;
    }
    await ensureCriticalAndroidChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: entry.input.title,
        body: entry.input.body,
        sound: CRITICAL_ORDER_SOUND_NAME,
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android'
          ? { channelId: CRITICAL_ORDER_CHANNEL_ID }
          : {}),
        data: {
          type: 'critical_order_alert',
          role: entry.input.role,
          event: entry.input.event,
          orderId: entry.input.orderId,
          alertKey: entry.key,
        },
      },
      trigger: null,
    });
    entry.localNotificationIds.push(id);
    return true;
  } catch (e) {
    logOrderAlert({
      role: entry.input.role,
      event: entry.input.event,
      orderId: entry.input.orderId,
      notificationScheduled: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

async function tearDown(entry: ActiveAlert, reason: string): Promise<void> {
  if (entry.timeoutTimer) {
    clearTimeout(entry.timeoutTimer);
    entry.timeoutTimer = null;
  }
  if (entry.sound) {
    try {
      await entry.sound.stopAsync();
    } catch {
      /* ignore */
    }
    try {
      await entry.sound.unloadAsync();
    } catch {
      /* ignore */
    }
    entry.sound = null;
  }
  for (const id of entry.localNotificationIds) {
    try {
      await Notifications.dismissNotificationAsync(id);
    } catch {
      /* ignore */
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      /* ignore */
    }
  }
  entry.localNotificationIds = [];
  logOrderAlert({
    role: entry.input.role,
    event: entry.input.event,
    orderId: entry.input.orderId,
    acknowledged: reason === 'ack',
    stopped: true,
    reason,
    durationMs: Date.now() - entry.startedAt,
    success: true,
  });
}

/**
 * Start (or no-op if already ringing) a critical alarm for one order event.
 */
export async function startCriticalOrderAlert(
  input: CriticalOrderAlertInput,
): Promise<CriticalOrderAlertKey | null> {
  if (Platform.OS === 'web' || isExpoGo) {
    logOrderAlert({
      role: input.role,
      event: input.event,
      orderId: input.orderId,
      skipped: true,
      reason: Platform.OS === 'web' ? 'web' : 'expo_go',
    });
    return null;
  }

  const orderId = input.orderId.trim();
  if (!orderId) return null;

  ensureAppStateWatch();

  const key = criticalOrderAlertKey(input.role, input.event, orderId);
  if (active.has(key)) {
    logOrderAlert({
      role: input.role,
      event: input.event,
      orderId,
      notificationId: key,
      duplicateSuppressed: true,
    });
    return key;
  }

  const entry: ActiveAlert = {
    key,
    input: { ...input, orderId },
    sound: null,
    timeoutTimer: null,
    localNotificationIds: [],
    startedAt: Date.now(),
  };
  active.set(key, entry);

  const soundPlayed = await playLoopingSound(entry);

  const wantLocal =
    input.presentLocalNotification ?? AppState.currentState !== 'active';
  const notificationScheduled = wantLocal
    ? await presentOneShotLocalNotification(entry)
    : false;

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  entry.timeoutTimer = setTimeout(() => {
    void stopCriticalOrderAlert({
      role: input.role,
      event: input.event,
      orderId,
      reason: 'timeout',
    });
  }, timeoutMs);

  logOrderAlert({
    role: input.role,
    event: input.event,
    orderId,
    notificationId: key,
    notificationScheduled,
    notificationPresented: notificationScheduled,
    soundPlayed,
    soundStarted: soundPlayed,
    acknowledged: false,
    appState: AppState.currentState,
    success: soundPlayed || notificationScheduled,
  });

  return key;
}

export async function stopCriticalOrderAlert(input: {
  role: OrderAlertRole;
  event: OrderAlertEvent;
  orderId: string;
  reason?: 'ack' | 'timeout' | 'replaced' | 'logout' | 'lifecycle';
}): Promise<void> {
  const key = criticalOrderAlertKey(input.role, input.event, input.orderId);
  const entry = active.get(key);
  if (!entry) return;
  active.delete(key);
  await tearDown(entry, input.reason ?? 'ack');
}

/** Stop every active alert for an order (any role/event). */
export async function stopCriticalOrderAlertsForOrder(
  orderId: string,
  reason: 'ack' | 'lifecycle' | 'logout' = 'ack',
): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;
  const matches = [...active.values()].filter((e) => e.input.orderId === oid);
  for (const entry of matches) {
    active.delete(entry.key);
    await tearDown(entry, reason);
  }
}

export async function stopAllCriticalOrderAlerts(
  reason: 'logout' | 'ack' = 'logout',
): Promise<void> {
  const entries = [...active.values()];
  active.clear();
  await Promise.all(entries.map((e) => tearDown(e, reason)));
}

export function isCriticalOrderAlertActive(
  role: OrderAlertRole,
  event: OrderAlertEvent,
  orderId: string,
): boolean {
  return active.has(criticalOrderAlertKey(role, event, orderId));
}

export function listActiveCriticalOrderAlertKeys(): string[] {
  return [...active.keys()];
}
