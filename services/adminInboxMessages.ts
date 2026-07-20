import type { FoodShareNotificationType } from '@/lib/foodShareUx';
import { createInboxNotification } from '@/services/foodShareInbox';
import { auth, db } from '@/services/firebase';
import { sendExpoPush } from '@/services/sendExpoPush';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

export type AdminInboxMessageKind =
  | 'admin_message'
  | 'admin_announcement'
  | 'admin_maintenance'
  | 'admin_promotion'
  | 'admin_feature'
  | 'admin_alert'
  | 'admin_account';

export type AdminInboxTargetMode = 'one' | 'multiple' | 'all';

function tokenFromUserData(data: Record<string, unknown>): string | null {
  for (const key of ['expoPushToken', 'pushToken', 'fcmToken'] as const) {
    const t = data[key];
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

/**
 * Deliver admin inbox messages into each recipient's `inboxNotifications`.
 * Push is best-effort when tokens are readable (admin).
 */
export async function sendAdminInboxMessages(input: {
  title: string;
  body: string;
  kind: AdminInboxMessageKind;
  targetMode: AdminInboxTargetMode;
  recipientUids: string[];
  deepLink?: string;
}): Promise<{ sent: number; failed: number }> {
  const caller = auth.currentUser;
  if (!caller) throw new Error('Sign in required');

  const title = input.title.trim() || 'HalfOrder';
  const body = input.body.trim();
  if (!body) throw new Error('Message body is required');

  const kind = input.kind;
  const deepLink = input.deepLink?.trim() || '/inbox';

  const recipientUids: string[] = [];
  const tokens: string[] = [];

  if (input.targetMode === 'all') {
    const snap = await getDocs(collection(db, 'users'));
    snap.docs.forEach((d) => {
      recipientUids.push(d.id);
      const token = tokenFromUserData(d.data() as Record<string, unknown>);
      if (token) tokens.push(token);
    });
  } else {
    const unique = Array.from(
      new Set(input.recipientUids.map((u) => u.trim()).filter(Boolean)),
    );
    if (unique.length === 0) {
      throw new Error('Select at least one recipient');
    }
    for (const uid of unique) {
      recipientUids.push(uid);
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
          const token = tokenFromUserData(
            snap.data() as Record<string, unknown>,
          );
          if (token) tokens.push(token);
        }
      } catch {
        /* ignore token lookup */
      }
    }
  }

  let sent = 0;
  let failed = 0;
  for (const uid of recipientUids) {
    try {
      await createInboxNotification({
        recipientUid: uid,
        type: kind as FoodShareNotificationType,
        title,
        body,
        deepLink,
        skipPush: true,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  if (tokens.length > 0) {
    try {
      await sendExpoPush(tokens, title, body, {
        type: kind,
        deepLink,
      });
    } catch {
      /* push is best-effort */
    }
  }

  try {
    await addDoc(collection(db, 'admin_notifications'), {
      title,
      message: body,
      kind,
      targetMode: input.targetMode,
      recipientUids:
        input.targetMode === 'all' ? ['*'] : recipientUids.slice(0, 200),
      sentToCount: sent,
      createdAt: serverTimestamp(),
      createdBy: caller.uid,
    });
  } catch {
    /* audit trail best-effort */
  }

  return { sent, failed };
}
