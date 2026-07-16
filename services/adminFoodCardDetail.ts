import {
  ADMIN_FOOD_CARD_SLOT_IDS,
  isAdminFoodCardSlotId,
  type AdminFoodCardSlotId,
} from '@/constants/adminFoodCards';
import { formatFirestoreTime } from '@/lib/admin/orderHelpers';
import { foodShareLifecycleLabel } from '@/lib/foodShareLifecycle';
import {
  promotionBadgeLabel,
  type PromotionBadgeValue,
} from '@/lib/promotionBadge';
import { parseFoodCardLocationFields } from '@/services/foodCards';
import { mapAdminFoodShareDoc } from '@/services/adminFoodSharesService';
import { mapMatchDoc } from '@/services/foodShareMatchService';
import type { FoodShareInviteStats } from '@/services/foodShareInvite';
import { subscribeFoodShareInviteStats } from '@/services/foodShareInvite';
import { db } from '@/services/firebase';
import type { FoodShareMatchDoc, MatchRequestDoc } from '@/types/foodShare';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type AdminFoodCardWaitingUser = {
  userId: string;
  userFirstName: string;
  joinedAtLabel: string;
  status: MatchRequestDoc['status'];
};

export type AdminFoodCardDetail = {
  cardId: AdminFoodCardSlotId;
  active: boolean;
  createdAtLabel: string;
  updatedAtLabel: string;
  foodName: string;
  restaurantName: string;
  image: string;
  description: string;
  originalPrice: number;
  sharedPrice: number;
  /** Admin promotion badge stored on the food card. */
  promotionBadge: PromotionBadgeValue;
  promotionBadgeLabel: string;
  portionsLabel: string;
  pickupAddress: string;
  city: string;
  coordinatesLabel: string;
  distanceLabel: string;
  deliveryEnabledLabel: string;
  pickupOnlyLabel: string;
  deliveryFeeLabel: string;
  pickupOrDeliveryLabel: string;
  dateLabel: string;
  timeLabel: string;
  deliveryStatusLabel: string;
  assignedDriverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  creatorUserId: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  creatorPhone: string | null;
  matchedUserId: string | null;
  matchedUserName: string | null;
  matchStatus: string | null;
  paymentStatus: string | null;
  matchId: string | null;
  matchTimestampLabel: string;
  pickupDateLabel: string;
  pickupTimeLabel: string;
  deliveryDateLabel: string;
  deliveryTimeLabel: string;
  expirationDateLabel: string;
  /** UIDs to target for card-related notifications. */
  notifyUserIds: string[];
  /** Users currently waiting for a partner on this card. */
  waitingUsers: AdminFoodCardWaitingUser[];
  inviteStats: FoodShareInviteStats;
  chatStatusLabel: string;
  hubStatusLabel: string;
};

type UserProfileSlice = {
  displayName: string | null;
  email: string | null;
  phone: string | null;
};

function normStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function normBoolLabel(v: unknown): string {
  if (v === true || v === 1 || v === 'true') return 'Yes';
  if (v === false || v === 0 || v === 'false') return 'No';
  return '—';
}

function moneyLabel(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return `$${amount.toFixed(2)}`;
}

function scheduleLabel(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = raw[key];
    if (v != null && v !== '') return formatFirestoreTime(v);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '—';
}

function mapMatchRequest(id: string, data: Record<string, unknown>): MatchRequestDoc {
  const statusRaw = String(data.status ?? 'WAITING').toUpperCase();
  const status =
    statusRaw === 'MATCHED' || statusRaw === 'CANCELLED' ? statusRaw : 'WAITING';
  return {
    id,
    adminFoodShareId:
      typeof data.adminFoodShareId === 'string' ? data.adminFoodShareId : '',
    userId: typeof data.userId === 'string' ? data.userId : '',
    userFirstName:
      typeof data.userFirstName === 'string' ? data.userFirstName : 'User',
    status,
    matchId: typeof data.matchId === 'string' ? data.matchId : null,
    createdAtMs: safeToMillis(data.createdAt),
  };
}

function userSlice(data: Record<string, unknown> | null): UserProfileSlice {
  if (!data) return { displayName: null, email: null, phone: null };
  return {
    displayName:
      normStr(data.displayName) ??
      normStr(data.firstName) ??
      normStr(data.name),
    email: normStr(data.email),
    phone:
      normStr(data.phoneNumber) ??
      normStr(data.phone) ??
      normStr(data.mobile),
  };
}

function pickLatestMatch(matches: FoodShareMatchDoc[]): FoodShareMatchDoc | null {
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    const am = a.createdAtMs ?? 0;
    const bm = b.createdAtMs ?? 0;
    return bm - am;
  })[0];
}

function buildDetail(input: {
  cardId: AdminFoodCardSlotId;
  cardRaw: Record<string, unknown>;
  queueRaw: Record<string, unknown> | null;
  requests: MatchRequestDoc[];
  matches: FoodShareMatchDoc[];
  inviteStats: FoodShareInviteStats;
  ownerProfile: Record<string, unknown> | null;
  matchedProfile: Record<string, unknown> | null;
  driverProfile: Record<string, unknown> | null;
  orderRaw: Record<string, unknown> | null;
}): AdminFoodCardDetail {
  const share = mapAdminFoodShareDoc(input.cardId, input.cardRaw);
  const hasCardContent =
    normStr(input.cardRaw.foodName) != null ||
    normStr(input.cardRaw.image) != null ||
    normStr(input.cardRaw.title) != null;
  const { geo, venue } = parseFoodCardLocationFields(
    input.cardRaw.location ?? input.cardRaw.pickupAddress ?? input.cardRaw.venueLocation,
  );
  const pickupAddress =
    normStr(input.cardRaw.pickupAddress) ??
    normStr(input.cardRaw.venueLocation) ??
    venue;
  const city = normStr(input.cardRaw.city) ?? '—';
  const distance =
    normStr(input.cardRaw.distance) ??
    normStr(input.cardRaw.distanceLabel) ??
    '—';
  const portions =
    typeof input.cardRaw.portions === 'number'
      ? input.cardRaw.portions
      : typeof input.cardRaw.servings === 'number'
        ? input.cardRaw.servings
        : null;

  const waitingUserId = normStr(input.queueRaw?.waitingUserId);
  const waitingFirstName = normStr(input.queueRaw?.waitingUserFirstName);
  const waitingRequest = input.requests.find((r) => r.status === 'WAITING');
  const ownerUserId = waitingUserId ?? waitingRequest?.userId ?? null;
  const ownerName =
    waitingFirstName ?? waitingRequest?.userFirstName ?? null;

  const latestMatch = pickLatestMatch(input.matches);
  const matchedRequest = input.requests.find((r) => r.status === 'MATCHED');
  const matchId = latestMatch?.id ?? matchedRequest?.matchId ?? null;

  let matchedUserId: string | null = null;
  let matchedUserName: string | null = null;
  if (latestMatch) {
    const [u0, u1] = latestMatch.users;
    const candidate = ownerUserId
      ? u0 === ownerUserId
        ? u1
        : u1 === ownerUserId
          ? u0
          : u1 || u0
      : u1 || u0;
    matchedUserId = candidate || null;
    matchedUserName =
      latestMatch.userA.uid === candidate
        ? latestMatch.userA.firstName
        : latestMatch.userB.uid === candidate
          ? latestMatch.userB.firstName
          : matchedRequest?.userFirstName ?? null;
  } else if (matchedRequest) {
    matchedUserId = matchedRequest.userId;
    matchedUserName = matchedRequest.userFirstName;
  }

  const ownerSlice = userSlice(input.ownerProfile);
  const matchedSlice = userSlice(input.matchedProfile);
  const driverSlice = userSlice(input.driverProfile);

  const assignedDriverId =
    normStr(input.orderRaw?.assignedDriverId) ??
    normStr(input.orderRaw?.driverId) ??
    normStr(input.cardRaw.assignedDriverId) ??
    normStr(input.cardRaw.driverId);

  const deliveryEnabled =
    input.cardRaw.deliveryEnabled !== undefined
      ? input.cardRaw.deliveryEnabled
      : share.deliveryShare > 0
        ? true
        : undefined;
  const pickupOnly = input.cardRaw.pickupOnly;
  const pickupOrDeliveryLabel = (() => {
    if (pickupOnly === true || pickupOnly === 'true') return 'Pickup';
    if (deliveryEnabled === false) return 'Pickup';
    if (deliveryEnabled === true || share.deliveryShare > 0) return 'Delivery';
    return '—';
  })();

  const dateLabel =
    scheduleLabel(input.cardRaw, 'pickupDate', 'deliveryDate', 'eventDate', 'date') !== '—'
      ? scheduleLabel(input.cardRaw, 'pickupDate', 'deliveryDate', 'eventDate', 'date')
      : formatFirestoreTime(input.cardRaw.createdAt);

  const timeLabel =
    normStr(input.cardRaw.pickupTime) ??
    normStr(input.cardRaw.deliveryTime) ??
    normStr(input.cardRaw.eventTime) ??
    normStr(input.cardRaw.time) ??
    '—';

  const deliveryStatusLabel =
    normStr(latestMatch?.deliveryStatus) ??
    normStr(latestMatch?.orderStatus) ??
    normStr(input.orderRaw?.deliveryStatus) ??
    normStr(input.orderRaw?.status) ??
    '—';

  const paymentStatus = latestMatch
    ? (() => {
        const statuses = Object.values(latestMatch.userPayments).map(
          (p) => p.paymentStatus,
        );
        if (statuses.length === 0) return 'PENDING';
        if (statuses.every((s) => s === 'PAID')) return 'PAID';
        if (statuses.some((s) => s === 'FAILED')) return 'FAILED';
        if (statuses.some((s) => s === 'AUTHORIZED')) return 'AUTHORIZED';
        return 'PENDING';
      })()
    : null;

  const notifyIds = new Set<string>();
  if (ownerUserId) notifyIds.add(ownerUserId);
  if (matchedUserId) notifyIds.add(matchedUserId);
  if (latestMatch) {
    latestMatch.users.forEach((uid) => {
      if (uid) notifyIds.add(uid);
    });
  }

  const waitingUsers: AdminFoodCardWaitingUser[] = input.requests
    .filter((r) => r.status === 'WAITING')
    .map((r) => ({
      userId: r.userId,
      userFirstName: r.userFirstName,
      joinedAtLabel: r.createdAtMs ? formatFirestoreTime(r.createdAtMs) : '—',
      status: r.status,
    }));

  return {
    cardId: input.cardId,
    active: share.active,
    createdAtLabel: formatFirestoreTime(input.cardRaw.createdAt),
    updatedAtLabel: formatFirestoreTime(input.cardRaw.updatedAt),
    foodName: hasCardContent
      ? share.foodName
      : `Slot ${input.cardId} (not configured)`,
    restaurantName: share.restaurantName,
    image: share.image,
    description: share.description || '—',
    originalPrice: share.originalPrice,
    sharedPrice: share.sharedPrice,
    promotionBadge: share.promotionBadge,
    promotionBadgeLabel: promotionBadgeLabel(share.promotionBadge) ?? 'None',
    portionsLabel: portions != null ? String(portions) : '—',
    pickupAddress: pickupAddress || '—',
    city,
    coordinatesLabel: geo
      ? `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}`
      : '—',
    distanceLabel: distance,
    deliveryEnabledLabel: normBoolLabel(deliveryEnabled),
    pickupOnlyLabel: normBoolLabel(pickupOnly),
    deliveryFeeLabel: moneyLabel(share.deliveryShare),
    pickupOrDeliveryLabel,
    dateLabel,
    timeLabel,
    deliveryStatusLabel,
    assignedDriverId,
    driverName: driverSlice.displayName,
    driverPhone: driverSlice.phone,
    creatorUserId: ownerUserId,
    creatorName: ownerSlice.displayName ?? ownerName,
    creatorEmail: ownerSlice.email,
    creatorPhone: ownerSlice.phone,
    matchedUserId,
    matchedUserName: matchedSlice.displayName ?? matchedUserName,
    matchStatus: latestMatch?.status ?? matchedRequest?.status ?? null,
    paymentStatus,
    matchId,
    matchTimestampLabel: latestMatch?.createdAtMs
      ? formatFirestoreTime(latestMatch.createdAtMs)
      : matchedRequest?.createdAtMs
        ? formatFirestoreTime(matchedRequest.createdAtMs)
        : '—',
    pickupDateLabel: scheduleLabel(input.cardRaw, 'pickupDate', 'pickupAt'),
    pickupTimeLabel:
      normStr(input.cardRaw.pickupTime) ??
      scheduleLabel(input.cardRaw, 'pickupTime'),
    deliveryDateLabel: scheduleLabel(input.cardRaw, 'deliveryDate', 'deliveryAt'),
    deliveryTimeLabel:
      normStr(input.cardRaw.deliveryTime) ??
      scheduleLabel(input.cardRaw, 'deliveryTime'),
    expirationDateLabel: scheduleLabel(
      input.cardRaw,
      'expirationDate',
      'expiresAt',
      'expirationAt',
    ),
    notifyUserIds: [...notifyIds],
    waitingUsers,
    inviteStats: input.inviteStats,
    chatStatusLabel: (() => {
      if (!latestMatch) return '—';
      const lc = String(latestMatch.lifecycle ?? '').toUpperCase();
      if (lc === 'MATCHED' || lc === 'ORDER_PLACED' || lc === 'DRIVER_ASSIGNED') {
        return 'Active';
      }
      if (
        lc === 'WAITING_FOR_PAYMENT' ||
        lc === 'WAITING_FOR_PAYMENT_CONFIRMATION' ||
        lc === 'PAYMENT_CONFIRMED'
      ) {
        return 'Pending payment';
      }
      if (lc === 'CANCELLED') return 'Cancelled';
      if (lc === 'COMPLETED' || lc === 'DELIVERED') return 'Archived';
      return '—';
    })(),
    hubStatusLabel: (() => {
      if (waitingUsers.length > 0) return 'Waiting for partner';
      if (!latestMatch) return '—';
      const lc = String(latestMatch.lifecycle ?? '').toUpperCase();
      if (
        lc === 'WAITING_FOR_PAYMENT' ||
        lc === 'WAITING_FOR_PAYMENT_CONFIRMATION' ||
        lc === 'PAYMENT_CONFIRMED'
      ) {
        return 'Awaiting payment';
      }
      if (lc === 'MATCHED') return 'Active chat';
      if (lc === 'COMPLETED' || lc === 'DELIVERED') return 'Completed';
      if (lc === 'CANCELLED') return 'Cancelled';
      return foodShareLifecycleLabel(lc);
    })(),
  };
}

export function subscribeAdminFoodCardDetail(
  cardId: string,
  onData: (detail: AdminFoodCardDetail | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!isAdminFoodCardSlotId(cardId)) {
    onData(null);
    return () => {};
  }
  const slotId = cardId as AdminFoodCardSlotId;

  let cardRaw: Record<string, unknown> = {};
  let queueRaw: Record<string, unknown> | null = null;
  let requests: MatchRequestDoc[] = [];
  let matches: FoodShareMatchDoc[] = [];
  let inviteStats: FoodShareInviteStats = {
    sent: 0,
    opened: 0,
    converted: 0,
    conversionRate: 0,
  };
  let ownerProfile: Record<string, unknown> | null = null;
  let matchedProfile: Record<string, unknown> | null = null;
  let driverProfile: Record<string, unknown> | null = null;
  let orderRaw: Record<string, unknown> | null = null;

  let ownerUnsub: Unsubscribe | null = null;
  let matchedUnsub: Unsubscribe | null = null;
  let driverUnsub: Unsubscribe | null = null;
  let orderUnsub: Unsubscribe | null = null;

  const emit = () => {
    onData(
      buildDetail({
        cardId: slotId,
        cardRaw,
        queueRaw,
        requests,
        matches,
        inviteStats,
        ownerProfile,
        matchedProfile,
        driverProfile,
        orderRaw,
      }),
    );
  };

  const bindUser = (
    uid: string | null,
    kind: 'owner' | 'matched' | 'driver',
  ) => {
    const clear = () => {
      if (kind === 'owner') ownerProfile = null;
      if (kind === 'matched') matchedProfile = null;
      if (kind === 'driver') driverProfile = null;
      emit();
    };
    if (kind === 'owner' && ownerUnsub) {
      ownerUnsub();
      ownerUnsub = null;
    }
    if (kind === 'matched' && matchedUnsub) {
      matchedUnsub();
      matchedUnsub = null;
    }
    if (kind === 'driver' && driverUnsub) {
      driverUnsub();
      driverUnsub = null;
    }
    if (!uid) {
      clear();
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        if (kind === 'owner') ownerProfile = data;
        if (kind === 'matched') matchedProfile = data;
        if (kind === 'driver') driverProfile = data;
        emit();
      },
      () => clear(),
    );
    if (kind === 'owner') ownerUnsub = unsub;
    if (kind === 'matched') matchedUnsub = unsub;
    if (kind === 'driver') driverUnsub = unsub;
  };

  const bindOrder = (orderId: string | null, driverId: string | null) => {
    if (orderUnsub) {
      orderUnsub();
      orderUnsub = null;
    }
    orderRaw = null;
    if (!orderId) {
      bindUser(driverId, 'driver');
      emit();
      return;
    }
    orderUnsub = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        orderRaw = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        const resolvedDriver =
          normStr(orderRaw?.assignedDriverId) ??
          normStr(orderRaw?.driverId) ??
          driverId;
        bindUser(resolvedDriver, 'driver');
        emit();
      },
      () => {
        orderRaw = null;
        bindUser(driverId, 'driver');
        emit();
      },
    );
  };

  const syncRelatedProfiles = () => {
    const waitingUserId = normStr(queueRaw?.waitingUserId);
    const waitingRequest = requests.find((r) => r.status === 'WAITING');
    const ownerUid = waitingUserId ?? waitingRequest?.userId ?? null;

    const latest = pickLatestMatch(matches);
    let matchedUid: string | null = null;
    if (latest) {
      const [u0, u1] = latest.users;
      matchedUid = ownerUid
        ? u0 === ownerUid
          ? u1
          : u1 === ownerUid
            ? u0
            : u1 || u0
        : u1 || u0;
    } else {
      const matchedReq = requests.find((r) => r.status === 'MATCHED');
      matchedUid = matchedReq?.userId ?? null;
    }

    bindUser(ownerUid, 'owner');
    bindUser(matchedUid, 'matched');

    const orderId =
      latest && typeof (latest as unknown as Record<string, unknown>).orderId === 'string'
        ? ((latest as unknown as Record<string, unknown>).orderId as string)
        : normStr(cardRaw.linkedOrderId) ?? normStr(cardRaw.orderId);
    const driverFromCard =
      normStr(cardRaw.assignedDriverId) ?? normStr(cardRaw.driverId);
    bindOrder(orderId, driverFromCard);
  };

  const unsubs: Unsubscribe[] = [
    onSnapshot(
      doc(db, 'adminFoodShares', slotId),
      (snap) => {
        cardRaw = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        syncRelatedProfiles();
        emit();
      },
      (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
    ),
    onSnapshot(
      doc(db, 'matchQueues', slotId),
      (snap) => {
        queueRaw = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        syncRelatedProfiles();
        emit();
      },
      () => {
        queueRaw = null;
        syncRelatedProfiles();
        emit();
      },
    ),
    onSnapshot(
      query(
        collection(db, 'matchRequests'),
        where('adminFoodShareId', '==', slotId),
      ),
      (snap) => {
        requests = snap.docs.map((d) =>
          mapMatchRequest(d.id, d.data() as Record<string, unknown>),
        );
        syncRelatedProfiles();
        emit();
      },
      () => {
        requests = [];
        syncRelatedProfiles();
        emit();
      },
    ),
    onSnapshot(
      query(collection(db, 'matches'), where('adminFoodShareId', '==', slotId)),
      (snap) => {
        matches = snap.docs.map((d) => {
          const mapped = mapMatchDoc(d.id, d.data() as Record<string, unknown>);
          mapped.createdAtMs = safeToMillis(
            (d.data() as Record<string, unknown>).createdAt,
          );
          return mapped;
        });
        syncRelatedProfiles();
        emit();
      },
      () => {
        matches = [];
        syncRelatedProfiles();
        emit();
      },
    ),
    subscribeFoodShareInviteStats(
      slotId,
      (stats) => {
        inviteStats = stats;
        emit();
      },
      () => {
        inviteStats = { sent: 0, opened: 0, converted: 0, conversionRate: 0 };
        emit();
      },
    ),
  ];

  return () => {
    unsubs.forEach((u) => u());
    ownerUnsub?.();
    matchedUnsub?.();
    driverUnsub?.();
    orderUnsub?.();
  };
}

export type AdminFoodCardWaitingQueue = {
  adminFoodShareId: string;
  waitingUserId: string | null;
  waitingUserFirstName: string | null;
};

/** Live waiting-user snapshot per food card slot (from `matchQueues`). */
export function subscribeAdminFoodCardWaitingQueues(
  onData: (rows: Record<string, AdminFoodCardWaitingQueue>) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const state: Record<string, AdminFoodCardWaitingQueue> = {};

  const emit = () => onData({ ...state });

  const unsubs = ADMIN_FOOD_CARD_SLOT_IDS.map((slotId) =>
    onSnapshot(
      doc(db, 'matchQueues', slotId),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        state[slotId] = {
          adminFoodShareId: slotId,
          waitingUserId: normStr(data?.waitingUserId),
          waitingUserFirstName: normStr(data?.waitingUserFirstName),
        };
        emit();
      },
      (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
    ),
  );

  return () => unsubs.forEach((u) => u());
}

export async function setAdminFoodCardActive(
  cardId: AdminFoodCardSlotId,
  active: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'adminFoodShares', cardId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAdminFoodCardSlot(
  cardId: AdminFoodCardSlotId,
): Promise<void> {
  const ref = doc(db, 'adminFoodShares', cardId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
  }
}

export { ADMIN_FOOD_CARD_SLOT_IDS };
