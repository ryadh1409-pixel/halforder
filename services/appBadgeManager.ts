/**
 * Centralized iOS/Android app-icon badge manager.
 *
 * Badge = unread inbox
 *       + unread notifications (profile inbox types counted once via inbox)
 *       + unread support messages
 *       + unread admin alerts (admins only)
 *
 * Owns `Notifications.setBadgeCountAsync` — other modules must not set the badge.
 */
import { isAdminUser } from '@/constants/adminUid';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { db } from '@/services/firebase';
import { subscribeUnreadInboxCount } from '@/services/foodShareInbox';
import {
  subscribeAdminSupportUnreadCount,
  subscribeCustomerSupportConversation,
} from '@/services/supportConversations';
import type { UserRole } from '@/services/userService';
import type { User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { AppState, Platform, type NativeEventSubscription } from 'react-native';
import * as Notifications from 'expo-notifications';

export type AppBadgeBreakdown = {
  inbox: number;
  notifications: number;
  support: number;
  adminAlerts: number;
};

export type AppBadgeTotals = AppBadgeBreakdown & {
  total: number;
};

type BadgeListener = (totals: AppBadgeTotals) => void;

let counts: AppBadgeBreakdown = {
  inbox: 0,
  notifications: 0,
  support: 0,
  adminAlerts: 0,
};

let lastApplied = -1;
let applyTimer: ReturnType<typeof setTimeout> | null = null;
let syncGeneration = 0;
let activeUid: string | null = null;
let activeIsAdmin: boolean | null = null;
let unsubs: Unsubscribe[] = [];
let appStateSub: NativeEventSubscription | null = null;
let notifReceivedSub: { remove: () => void } | null = null;
const listeners = new Set<BadgeListener>();

function sumTotals(): AppBadgeTotals {
  const total = Math.max(
    0,
    counts.inbox +
      counts.notifications +
      counts.support +
      counts.adminAlerts,
  );
  return { ...counts, total };
}

function emit(): void {
  const totals = sumTotals();
  listeners.forEach((fn) => {
    try {
      fn(totals);
    } catch {
      /* ignore listener errors */
    }
  });
}

async function applyBadge(total: number): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  if (total === lastApplied) return;
  lastApplied = total;
  try {
    await Notifications.setBadgeCountAsync(total);
  } catch {
    lastApplied = -1;
  }
}

function scheduleApply(): void {
  emit();
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    applyTimer = null;
    void applyBadge(sumTotals().total);
  }, 80);
}

function setPartial(patch: Partial<AppBadgeBreakdown>): void {
  counts = { ...counts, ...patch };
  scheduleApply();
}

function clearSubscriptions(): void {
  unsubs.forEach((u) => {
    try {
      u();
    } catch {
      /* ignore */
    }
  });
  unsubs = [];
  if (notifReceivedSub) {
    try {
      notifReceivedSub.remove();
    } catch {
      /* ignore */
    }
    notifReceivedSub = null;
  }
  if (appStateSub) {
    try {
      appStateSub.remove();
    } catch {
      /* ignore */
    }
    appStateSub = null;
  }
}

function subscribeAdminAlertUnread(
  adminUid: string,
  onCount: (n: number) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc')),
    (snap) => {
      let n = 0;
      // Cap scan — badge only needs unread count, not full history.
      const max = Math.min(snap.docs.length, 300);
      for (let i = 0; i < max; i++) {
        const data = snap.docs[i].data() as Record<string, unknown>;
        const readBy = Array.isArray(data.readBy)
          ? data.readBy.filter((x): x is string => typeof x === 'string')
          : [];
        if (!readBy.includes(adminUid)) n += 1;
      }
      onCount(n);
    },
    () => onCount(0),
  );
}

/**
 * Start realtime badge sync for the signed-in user.
 * Idempotent per uid+admin — safe to call on every auth event.
 */
export function startAppBadgeSync(input: {
  user: User | null | undefined;
  firestoreUserRole: UserRole | null | undefined;
}): void {
  const uid = input.user?.uid?.trim() || null;
  const isAdmin = isAdminUser(input.user, input.firestoreUserRole);

  if (!uid) {
    stopAppBadgeSync();
    return;
  }

  if (
    uid === activeUid &&
    activeIsAdmin === isAdmin &&
    unsubs.length > 0
  ) {
    void refreshAppBadgeNow();
    return;
  }

  // Tear down previous listeners without clearing the OS badge to 0
  // (avoids a flash when role resolves after login).
  syncGeneration += 1;
  clearSubscriptions();
  if (applyTimer) {
    clearTimeout(applyTimer);
    applyTimer = null;
  }

  activeUid = uid;
  activeIsAdmin = isAdmin;
  const gen = ++syncGeneration;
  counts = { inbox: 0, notifications: 0, support: 0, adminAlerts: 0 };
  lastApplied = -1;

  // Inbox notifications (Profile Inbox).
  unsubs.push(
    subscribeUnreadInboxCount(uid, (n) => {
      if (gen !== syncGeneration) return;
      // Product "notifications" for customers live in the same inbox feed.
      setPartial({ inbox: Math.max(0, n), notifications: 0 });
    }),
  );

  // Customer support unread.
  unsubs.push(
    subscribeCustomerSupportConversation(uid, (row) => {
      if (gen !== syncGeneration) return;
      if (isAdmin) return;
      const n = row?.unreadCustomer ?? 0;
      setPartial({ support: Math.max(0, n) });
    }),
  );

  if (isAdmin) {
    unsubs.push(
      subscribeAdminSupportUnreadCount((n) => {
        if (gen !== syncGeneration) return;
        setPartial({ support: Math.max(0, n) });
      }),
    );
    unsubs.push(
      subscribeAdminAlertUnread(uid, (n) => {
        if (gen !== syncGeneration) return;
        setPartial({ adminAlerts: Math.max(0, n) });
      }),
    );
  } else {
    setPartial({ adminAlerts: 0 });
  }

  if (Platform.OS !== 'web' && !isExpoGo) {
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshAppBadgeNow();
      }
    });
    notifReceivedSub = Notifications.addNotificationReceivedListener(() => {
      // Push payloads may set a stale badge — re-apply authoritative total.
      lastApplied = -1;
      scheduleApply();
    });
  }

  scheduleApply();
}

/** Tear down listeners and clear the icon badge. */
export function stopAppBadgeSync(): void {
  syncGeneration += 1;
  clearSubscriptions();
  activeUid = null;
  activeIsAdmin = null;
  counts = { inbox: 0, notifications: 0, support: 0, adminAlerts: 0 };
  if (applyTimer) {
    clearTimeout(applyTimer);
    applyTimer = null;
  }
  lastApplied = -1;
  void applyBadge(0);
  emit();
}

/** Force re-apply current totals (e.g. after marking inbox read). */
export async function refreshAppBadgeNow(): Promise<void> {
  lastApplied = -1;
  await applyBadge(sumTotals().total);
}

export function getAppBadgeTotals(): AppBadgeTotals {
  return sumTotals();
}

export function subscribeAppBadgeTotals(listener: BadgeListener): () => void {
  listeners.add(listener);
  listener(sumTotals());
  return () => {
    listeners.delete(listener);
  };
}

/** @deprecated Prefer startAppBadgeSync — kept for one-off clears. */
export async function clearAppBadge(): Promise<void> {
  counts = { inbox: 0, notifications: 0, support: 0, adminAlerts: 0 };
  lastApplied = -1;
  await applyBadge(0);
  emit();
}
