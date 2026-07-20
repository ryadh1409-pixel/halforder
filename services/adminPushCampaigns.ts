import type { AdminInboxTargetMode } from '@/services/adminInboxMessages';
import { auth, db } from '@/services/firebase';
import { sendExpoPush } from '@/services/sendExpoPush';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type PushNotificationCategory =
  | 'order_update'
  | 'payment'
  | 'promotion'
  | 'emo_ai'
  | 'reminder'
  | 'announcement'
  | 'feature_update'
  | 'maintenance'
  | 'support'
  | 'admin_announcement';

export type PushCampaignStatus =
  | 'scheduled'
  | 'sending'
  | 'delivered'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type PushCampaign = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  category: PushNotificationCategory;
  deepLink: string;
  targetMode: AdminInboxTargetMode;
  recipientUids: string[];
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  openedCount: number;
  status: PushCampaignStatus;
  scheduledForMs: number | null;
  createdAtMs: number | null;
  createdBy: string | null;
};

export const PUSH_CATEGORIES: {
  id: PushNotificationCategory;
  label: string;
  defaultDeepLink: string;
}[] = [
  { id: 'order_update', label: 'Order Update', defaultDeepLink: '/(tabs)/search' },
  { id: 'payment', label: 'Payment', defaultDeepLink: '/wallet' },
  { id: 'promotion', label: 'Promotion', defaultDeepLink: '/(tabs)' },
  { id: 'emo_ai', label: 'Emo AI', defaultDeepLink: '/(tabs)/emo-ai' },
  { id: 'reminder', label: 'Reminder', defaultDeepLink: '/(tabs)' },
  { id: 'announcement', label: 'Announcement', defaultDeepLink: '/inbox' },
  { id: 'feature_update', label: 'Feature Update', defaultDeepLink: '/(tabs)' },
  { id: 'maintenance', label: 'Maintenance', defaultDeepLink: '/inbox' },
  { id: 'support', label: 'Support', defaultDeepLink: '/inbox' },
  {
    id: 'admin_announcement',
    label: 'Admin Announcement',
    defaultDeepLink: '/inbox',
  },
];

const COL = 'pushCampaigns';

function tokenFromUserData(data: Record<string, unknown>): string | null {
  for (const key of ['expoPushToken', 'pushToken', 'fcmToken'] as const) {
    const t = data[key];
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

function mapCampaign(id: string, data: Record<string, unknown>): PushCampaign {
  const status = String(data.status ?? 'delivered') as PushCampaignStatus;
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : null,
    category: (typeof data.category === 'string'
      ? data.category
      : 'announcement') as PushNotificationCategory,
    deepLink: typeof data.deepLink === 'string' ? data.deepLink : '/inbox',
    targetMode: (data.targetMode === 'one' || data.targetMode === 'multiple'
      ? data.targetMode
      : 'all') as AdminInboxTargetMode,
    recipientUids: Array.isArray(data.recipientUids)
      ? data.recipientUids.filter((u): u is string => typeof u === 'string')
      : [],
    recipientCount: typeof data.recipientCount === 'number' ? data.recipientCount : 0,
    deliveredCount: typeof data.deliveredCount === 'number' ? data.deliveredCount : 0,
    failedCount: typeof data.failedCount === 'number' ? data.failedCount : 0,
    openedCount: typeof data.openedCount === 'number' ? data.openedCount : 0,
    status,
    scheduledForMs: safeToMillis(data.scheduledFor),
    createdAtMs: safeToMillis(data.createdAt),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : null,
  };
}

export function subscribePushCampaigns(
  onRows: (rows: PushCampaign[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL), orderBy('createdAt', 'desc')),
    (snap) => {
      onRows(
        snap.docs.map((d) =>
          mapCampaign(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    () => onRows([]),
  );
}

export async function deletePushCampaign(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export async function sendProfessionalPush(input: {
  title: string;
  body: string;
  imageUrl?: string | null;
  category: PushNotificationCategory;
  deepLink: string;
  targetMode: AdminInboxTargetMode;
  recipientUids: string[];
  scheduleLaterMs?: number | null;
}): Promise<{ campaignId: string; delivered: number; failed: number }> {
  const caller = auth.currentUser;
  if (!caller) throw new Error('Sign in required');

  const title = input.title.trim() || 'HalfOrder';
  const body = input.body.trim();
  if (!body) throw new Error('Notification body is required');

  const tokens: string[] = [];
  const recipientUids: string[] = [];

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
    if (unique.length === 0) throw new Error('Select at least one recipient');
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
        /* ignore */
      }
    }
  }

  const scheduleLaterMs = input.scheduleLaterMs ?? null;
  const isScheduled =
    scheduleLaterMs != null && scheduleLaterMs > Date.now() + 5_000;

  const ref = await addDoc(collection(db, COL), {
    title,
    body,
    imageUrl: input.imageUrl?.trim() || null,
    category: input.category,
    deepLink: input.deepLink.trim() || '/inbox',
    targetMode: input.targetMode,
    recipientUids:
      input.targetMode === 'all' ? ['*'] : recipientUids.slice(0, 500),
    recipientCount: recipientUids.length,
    deliveredCount: 0,
    failedCount: 0,
    openedCount: 0,
    status: isScheduled ? 'scheduled' : 'sending',
    scheduledFor: isScheduled ? new Date(scheduleLaterMs!) : null,
    createdAt: serverTimestamp(),
    createdBy: caller.uid,
  });

  if (isScheduled) {
    return { campaignId: ref.id, delivered: 0, failed: 0 };
  }

  const result = await sendExpoPush(tokens, title, body, {
    type: input.category,
    deepLink: input.deepLink.trim() || '/inbox',
    campaignId: ref.id,
    ...(input.imageUrl?.trim()
      ? { image: input.imageUrl.trim() }
      : {}),
  }, {
    priority: 'high',
    channelId: 'halforder',
    badge: 1,
    mutableContent: Boolean(input.imageUrl?.trim()),
  });

  const status: PushCampaignStatus =
    result.failed === 0 && result.sent > 0
      ? 'delivered'
      : result.sent > 0
        ? 'partial'
        : 'failed';

  await updateDoc(doc(db, COL, ref.id), {
    status,
    deliveredCount: result.sent,
    failedCount: result.failed,
  });

  try {
    await addDoc(collection(db, 'admin_notifications'), {
      title,
      message: body,
      kind: 'push_campaign',
      category: input.category,
      campaignId: ref.id,
      deepLink: input.deepLink,
      deliveredOk: result.sent,
      failedCount: result.failed,
      createdAt: serverTimestamp(),
      createdBy: caller.uid,
    });
  } catch {
    /* audit best-effort */
  }

  return { campaignId: ref.id, delivered: result.sent, failed: result.failed };
}

export async function resendPushCampaign(campaign: PushCampaign): Promise<void> {
  await sendProfessionalPush({
    title: campaign.title,
    body: campaign.body,
    imageUrl: campaign.imageUrl,
    category: campaign.category,
    deepLink: campaign.deepLink,
    targetMode: campaign.targetMode === 'all' ? 'all' : campaign.targetMode,
    recipientUids: campaign.recipientUids.filter((u) => u !== '*'),
  });
}
