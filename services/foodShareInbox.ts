import { FOOD_SHARE_PUSH } from '@/constants/foodSharePushTypes';
import { USER_ROUTES } from '@/lib/navigationPaths';
import type { FoodShareNotificationType } from '@/lib/foodShareUx';
import { sendPushNotification } from '@/services/expoPushSend';
import { auth, db } from '@/services/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type InboxNotification = {
  id: string;
  type: FoodShareNotificationType;
  title: string;
  body: string;
  read: boolean;
  deepLink: string;
  matchId: string | null;
  adminFoodShareId: string | null;
  createdAtMs: number | null;
};

export type FoodShareNotificationPrefs = {
  match: boolean;
  chat: boolean;
  order: boolean;
  marketing: boolean;
};

export const DEFAULT_FOOD_SHARE_NOTIFICATION_PREFS: FoodShareNotificationPrefs =
  {
    match: true,
    chat: true,
    order: true,
    marketing: false,
  };

function inboxCol(uid: string) {
  return collection(db, 'users', uid, 'inboxNotifications');
}

async function getExpoPushTokenForUser(uid: string): Promise<string | null> {
  const uSnap = await getDoc(doc(db, 'users', uid));
  if (uSnap.exists()) {
    const d = uSnap.data() as Record<string, unknown>;
    for (const key of ['expoPushToken', 'pushToken', 'fcmToken'] as const) {
      const t = d[key];
      if (typeof t === 'string' && t.trim()) return t.trim();
    }
  }
  const subSnap = await getDoc(doc(db, 'users', uid, 'pushToken', 'default'));
  if (subSnap.exists()) {
    const t = subSnap.data()?.token;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

export async function getFoodShareNotificationPrefs(
  uid: string,
): Promise<FoodShareNotificationPrefs> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return DEFAULT_FOOD_SHARE_NOTIFICATION_PREFS;
  const raw = snap.data()?.notificationPrefs as
    | { foodShare?: Partial<FoodShareNotificationPrefs> }
    | undefined;
  return {
    ...DEFAULT_FOOD_SHARE_NOTIFICATION_PREFS,
    ...(raw?.foodShare ?? {}),
  };
}

export async function saveFoodShareNotificationPrefs(
  prefs: FoodShareNotificationPrefs,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  await updateDoc(doc(db, 'users', uid), {
    notificationPrefs: { foodShare: prefs },
    updatedAt: serverTimestamp(),
  });
}

function prefAllows(
  prefs: FoodShareNotificationPrefs,
  type: FoodShareNotificationType,
): boolean {
  if (type === 'chat_message') return prefs.chat;
  if (type === 'chat_message_blocked' || type === 'chat_warning') return prefs.chat;
  if (
    type === 'order_placed' ||
    type === 'driver_assigned' ||
    type === 'driver_arrived' ||
    type === 'picked_up' ||
    type === 'delivered' ||
    type === 'order_completed'
  ) {
    return prefs.order;
  }
  if (type === 'share_joined' || type === 'match_created' || type === 'match_cancelled') {
    return prefs.match;
  }
  if (
    type === 'pairing_awaiting_payment' ||
    type === 'payment_success' ||
    type === 'payment_failed' ||
    type === 'partner_paid' ||
    type === 'refund_processed' ||
    type === 'match_activated' ||
    type === 'user_blocked' ||
    type === 'report_submitted'
  ) {
    return prefs.match;
  }
  return true;
}

export async function createInboxNotification(input: {
  recipientUid: string;
  type: FoodShareNotificationType;
  title: string;
  body: string;
  deepLink: string;
  matchId?: string | null;
  adminFoodShareId?: string | null;
  pushType?: string;
  pushData?: Record<string, string>;
  skipPush?: boolean;
}): Promise<string | null> {
  const recipientUid = input.recipientUid.trim();
  if (!recipientUid) return null;

  const inboxPath = `users/${recipientUid}/inboxNotifications`;
  const payload = {
    recipientUid,
    type: input.type,
    title: input.title,
    body: input.body,
    read: false,
    deepLink: input.deepLink,
    matchId: input.matchId ?? null,
    adminFoodShareId: input.adminFoodShareId ?? null,
    createdAt: serverTimestamp(),
  };
  const callerUid = auth.currentUser?.uid ?? null;

  console.log('[INBOX WRITE] before', {
    path: inboxPath,
    uid: callerUid,
    recipientUid,
    payload: { ...payload, createdAt: 'serverTimestamp' },
  });

  let ref;
  try {
    ref = await addDoc(inboxCol(recipientUid), payload);
    console.log('[INBOX WRITE] success', {
      path: inboxPath,
      uid: callerUid,
      notificationId: ref.id,
    });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error('[INBOX WRITE] failure', {
      path: inboxPath,
      uid: callerUid,
      code: err?.code ?? 'unknown',
      message: err?.message ?? String(error),
      error,
    });
    throw error;
  }

  const canReadRecipientProfile = callerUid != null && callerUid === recipientUid;
  if (!input.skipPush && canReadRecipientProfile) {
    const prefs = await getFoodShareNotificationPrefs(recipientUid);
    if (prefAllows(prefs, input.type)) {
      const token = await getExpoPushTokenForUser(recipientUid);
      await sendPushNotification(
        token,
        input.title,
        input.body,
        {
          type: input.pushType ?? FOOD_SHARE_PUSH.MATCH_CREATED,
          notificationId: ref.id,
          deepLink: input.deepLink,
          ...(input.matchId ? { matchId: input.matchId } : {}),
          ...(input.adminFoodShareId
            ? { adminFoodShareId: input.adminFoodShareId }
            : {}),
          ...input.pushData,
        },
      );
    }
  } else if (!input.skipPush && !canReadRecipientProfile) {
    console.log('[INBOX WRITE] skip push — cannot read another user profile from client', {
      callerUid,
      recipientUid,
    });
  }

  return ref.id;
}

export async function notifyAdminFoodShareEvent(input: {
  title: string;
  message: string;
  kind: 'match_created' | 'user_reported' | 'match_cancelled' | 'payment_issue';
  matchId?: string;
  adminFoodShareId?: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'admin_notifications'), {
      title: input.title,
      message: input.message,
      kind: input.kind,
      matchId: input.matchId ?? null,
      adminFoodShareId: input.adminFoodShareId ?? null,
      sentToCount: 0,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Admin inbox is best-effort from client.
  }
}

export function subscribeInboxNotifications(
  uid: string,
  onData: (rows: InboxNotification[]) => void,
): Unsubscribe {
  const q = query(inboxCol(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const rows: InboxNotification[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const createdAt = data.createdAt;
        return {
          id: d.id,
          type: (typeof data.type === 'string'
            ? data.type
            : 'match_created') as FoodShareNotificationType,
          title: typeof data.title === 'string' ? data.title : 'Notification',
          body: typeof data.body === 'string' ? data.body : '',
          read: data.read === true,
          deepLink: typeof data.deepLink === 'string' ? data.deepLink : '/(tabs)/swipe',
          matchId: typeof data.matchId === 'string' ? data.matchId : null,
          adminFoodShareId:
            typeof data.adminFoodShareId === 'string'
              ? data.adminFoodShareId
              : null,
          createdAtMs:
            createdAt && typeof createdAt === 'object' && 'toMillis' in createdAt
              ? (createdAt as { toMillis: () => number }).toMillis()
              : null,
        };
      });
      onData(rows);
    },
    () => onData([]),
  );
}

export function subscribeUnreadInboxCount(
  uid: string,
  onCount: (count: number) => void,
): Unsubscribe {
  const q = query(inboxCol(uid), where('read', '==', false));
  return onSnapshot(
    q,
    (snap) => onCount(snap.size),
    () => onCount(0),
  );
}

export async function markInboxNotificationRead(
  uid: string,
  notificationId: string,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'inboxNotifications', notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
}

export async function markAllInboxNotificationsRead(uid: string): Promise<void> {
  // Lightweight: mark on open in UI per-item; bulk optional later.
}

export function deepLinkForMatch(matchId: string): string {
  return USER_ROUTES.foodShareMatch(matchId);
}

export function deepLinkForFoodSharePay(matchId: string): string {
  return USER_ROUTES.foodSharePay(matchId);
}

export function deepLinkForFoodShareWaiting(adminFoodShareId: string): string {
  return USER_ROUTES.foodShareWaiting(adminFoodShareId);
}

export function deepLinkForFoodShare(adminFoodShareId: string, inviteId?: string): string {
  const base = USER_ROUTES.foodShare(adminFoodShareId);
  return inviteId?.trim()
    ? `${base}?invite=${encodeURIComponent(inviteId.trim())}`
    : base;
}

export function deepLinkForMatchChat(matchId: string): string {
  return USER_ROUTES.foodShareChat(matchId);
}
