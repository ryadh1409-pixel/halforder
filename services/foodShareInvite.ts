import {
  buildFoodShareInviteLink,
  buildFoodShareInviteMessage,
  resolvePickupOrDeliveryLabel,
  resolveShareDateLabel,
  resolveShareTimeLabel,
  shareFoodShareInviteViaWhatsApp,
  type FoodShareInviteMessageInput,
} from '@/lib/foodShareInvite';
import { buildAdminShareCostBreakdown } from '@/lib/foodSharePricing';
import { mapAdminFoodShareDoc } from '@/services/adminFoodSharesService';
import { auth, db } from '@/services/firebase';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type FoodShareInviteChannel = 'whatsapp' | 'share_sheet';

export type FoodShareInviteStats = {
  sent: number;
  opened: number;
  converted: number;
  conversionRate: number;
};

export type SendFoodShareInviteInput = {
  adminFoodShareId: string;
  shareRaw?: Record<string, unknown>;
  foodName?: string;
  restaurantName?: string;
  sharedPrice?: number;
  deliveryShare?: number;
  totalPerUser?: number;
  pickupOrDelivery?: string;
  dateLabel?: string;
  timeLabel?: string;
};

function emptyStats(): FoodShareInviteStats {
  return { sent: 0, opened: 0, converted: 0, conversionRate: 0 };
}

function computeConversionRate(converted: number, sent: number): number {
  if (sent <= 0) return 0;
  return Math.round((converted / sent) * 1000) / 10;
}

function statsFromDocs(
  docs: Array<{ data: () => Record<string, unknown> }>,
): FoodShareInviteStats {
  let sent = 0;
  let opened = 0;
  let converted = 0;
  for (const d of docs) {
    sent += 1;
    const row = d.data();
    if (row.openedAt != null) opened += 1;
    if (row.convertedAt != null) converted += 1;
  }
  return {
    sent,
    opened,
    converted,
    conversionRate: computeConversionRate(converted, sent),
  };
}

function buildMessageInput(
  adminFoodShareId: string,
  inviteLink: string,
  input: SendFoodShareInviteInput,
): FoodShareInviteMessageInput {
  const raw = input.shareRaw ?? {};
  const share = mapAdminFoodShareDoc(adminFoodShareId, raw);
  const breakdown = buildAdminShareCostBreakdown(
    share.originalPrice,
    share.sharedPrice,
    share.deliveryShare,
  );
  return {
    adminFoodShareId,
    foodName: input.foodName ?? share.foodName,
    restaurantName: input.restaurantName ?? share.restaurantName,
    sharedPrice: input.sharedPrice ?? breakdown.sharedPrice,
    deliveryShare: input.deliveryShare ?? breakdown.deliveryShare,
    totalPerUser: input.totalPerUser ?? breakdown.totalPerUser,
    pickupOrDelivery: input.pickupOrDelivery ?? resolvePickupOrDeliveryLabel(raw),
    dateLabel: input.dateLabel ?? resolveShareDateLabel(raw),
    timeLabel: input.timeLabel ?? resolveShareTimeLabel(raw),
    inviteLink,
  };
}

export async function sendFoodShareInvite(
  input: SendFoodShareInviteInput,
): Promise<{ inviteId: string; channel: FoodShareInviteChannel }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in to invite a friend.');

  const adminFoodShareId = input.adminFoodShareId.trim();
  if (!adminFoodShareId) throw new Error('Missing meal share.');

  const placeholderLink = buildFoodShareInviteLink(adminFoodShareId);
  const ref = await addDoc(collection(db, 'foodShareInvites'), {
    senderUid: uid,
    adminFoodShareId,
    inviteLink: placeholderLink,
    channel: 'whatsapp',
    createdAt: serverTimestamp(),
    openedAt: null,
    openedByUid: null,
    convertedAt: null,
    convertedMatchId: null,
  });

  const inviteLink = buildFoodShareInviteLink(adminFoodShareId, ref.id);
  await updateDoc(ref, { inviteLink });

  const message = buildFoodShareInviteMessage(
    buildMessageInput(adminFoodShareId, inviteLink, input),
  );
  const channel = await shareFoodShareInviteViaWhatsApp(message, inviteLink);
  const resolvedChannel: FoodShareInviteChannel =
    channel === 'whatsapp' ? 'whatsapp' : 'share_sheet';

  await updateDoc(ref, { channel: resolvedChannel });

  console.log('[FOOD SHARE INVITE]', {
    event: 'invite_sent',
    inviteId: ref.id,
    adminFoodShareId,
    channel: resolvedChannel,
  });

  return { inviteId: ref.id, channel: resolvedChannel };
}

export async function recordFoodShareInviteOpened(
  inviteId: string,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !inviteId.trim()) return;

  const ref = doc(db, 'foodShareInvites', inviteId.trim());
  try {
    await updateDoc(ref, {
      openedAt: serverTimestamp(),
      openedByUid: uid,
    });
    console.log('[FOOD SHARE INVITE]', {
      event: 'invite_opened',
      inviteId: inviteId.trim(),
      openedByUid: uid,
    });
  } catch (e) {
    console.warn('[FOOD SHARE INVITE] open track failed', e);
  }
}

export async function markFoodShareInviteConverted(input: {
  inviteId?: string | null;
  adminFoodShareId: string;
  matchId: string;
  userA: string;
  userB: string;
}): Promise<void> {
  const { inviteId, adminFoodShareId, matchId, userA, userB } = input;
  if (!adminFoodShareId || !matchId || !userA || !userB) return;

  if (inviteId?.trim()) {
    try {
      await updateDoc(doc(db, 'foodShareInvites', inviteId.trim()), {
        convertedAt: serverTimestamp(),
        convertedMatchId: matchId,
      });
      console.log('[FOOD SHARE INVITE]', {
        event: 'invite_converted',
        inviteId: inviteId.trim(),
        matchId,
        adminFoodShareId,
        source: 'pending_invite',
      });
      return;
    } catch (e) {
      console.warn('[FOOD SHARE INVITE] pending conversion failed', e);
    }
  }

  try {
    const snap = await getDocs(
      query(
        collection(db, 'foodShareInvites'),
        where('adminFoodShareId', '==', adminFoodShareId),
      ),
    );

    for (const d of snap.docs) {
      const row = d.data() as Record<string, unknown>;
      if (row.convertedAt != null) continue;
      const senderUid = typeof row.senderUid === 'string' ? row.senderUid : '';
      const openedByUid =
        typeof row.openedByUid === 'string' ? row.openedByUid : '';
      if (!senderUid || !openedByUid) continue;

      const pair = new Set([userA, userB]);
      if (!pair.has(senderUid) || !pair.has(openedByUid)) continue;
      if (senderUid === openedByUid) continue;

      await updateDoc(d.ref, {
        convertedAt: serverTimestamp(),
        convertedMatchId: matchId,
      });
      console.log('[FOOD SHARE INVITE]', {
        event: 'invite_converted',
        inviteId: d.id,
        matchId,
        adminFoodShareId,
        source: 'pair_lookup',
      });
      break;
    }
  } catch (e) {
    console.warn('[FOOD SHARE INVITE] conversion track failed', e);
  }
}

export async function markInviteConvertedById(
  inviteId: string,
  matchId: string,
): Promise<void> {
  if (!inviteId.trim() || !matchId.trim()) return;
  await updateDoc(doc(db, 'foodShareInvites', inviteId.trim()), {
    convertedAt: serverTimestamp(),
    convertedMatchId: matchId,
  });
}

export function subscribeFoodShareInviteStats(
  adminFoodShareId: string,
  onData: (stats: FoodShareInviteStats) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!adminFoodShareId.trim()) {
    onData(emptyStats());
    return () => {};
  }

  return onSnapshot(
    query(
      collection(db, 'foodShareInvites'),
      where('adminFoodShareId', '==', adminFoodShareId.trim()),
    ),
    (snap) => onData(statsFromDocs(snap.docs)),
    (e) => {
      onError?.(e instanceof Error ? e : new Error(String(e)));
      onData(emptyStats());
    },
  );
}

export function subscribeAllFoodShareInviteStats(
  onData: (stats: FoodShareInviteStats) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'foodShareInvites'),
    (snap) => onData(statsFromDocs(snap.docs)),
    (e) => {
      onError?.(e instanceof Error ? e : new Error(String(e)));
      onData(emptyStats());
    },
  );
}
