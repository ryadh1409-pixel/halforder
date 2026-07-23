import type { FoodShareMatchDoc, MatchRequestDoc } from '@/types/foodShare';
import { formatTimeRemaining } from '@/lib/foodSharePricing';
import { resolvePickupOrDeliveryLabel } from '@/lib/foodShareInvite';
import { safeToMillis } from '@/utils/safeToMillis';

export type FoodShareHubStatus =
  | 'waiting_partner'
  | 'match_found'
  | 'awaiting_payment'
  | 'waiting_partner_payment'
  | 'active_chat'
  | 'completed'
  | 'cancelled';

export const HUB_STATUS_META: Record<
  FoodShareHubStatus,
  { label: string; emoji: string; color: string; priority: number }
> = {
  waiting_partner: {
    label: 'Waiting for partner',
    emoji: '🟡',
    color: '#F59E0B',
    priority: 1,
  },
  match_found: {
    label: 'Match found',
    emoji: '🔵',
    color: '#3B82F6',
    priority: 2,
  },
  awaiting_payment: {
    label: 'Awaiting payment',
    emoji: '🟣',
    color: '#3B82F6',
    priority: 3,
  },
  waiting_partner_payment: {
    label: 'Waiting for partner to pay',
    emoji: '🟣',
    color: '#A855F7',
    priority: 3,
  },
  active_chat: {
    label: 'Active chat',
    emoji: '🟢',
    color: '#22C55E',
    priority: 4,
  },
  completed: {
    label: 'Completed',
    emoji: '⚫',
    color: '#7D8493',
    priority: 90,
  },
  cancelled: {
    label: 'Cancelled',
    emoji: '🔴',
    color: '#EF4444',
    priority: 99,
  },
};

export type FoodShareHubItem = {
  hubId: string;
  kind: 'waiting' | 'match';
  adminFoodShareId: string;
  matchId: string | null;
  status: FoodShareHubStatus;
  foodName: string;
  restaurantName: string;
  foodImageUrl: string;
  joinedAtMs: number | null;
  pickupOrDelivery: string;
  sharedPrice: number;
  deliveryShare: number;
  totalPerUser: number;
  totalPaid: number | null;
  countdownLabel: string | null;
  partnerFirstName: string | null;
  partnerPhotoUrl: string | null;
  lifecycle: string | null;
  orderId: string | null;
  shareRaw: Record<string, unknown> | null;
  match: FoodShareMatchDoc | null;
  request: MatchRequestDoc | null;
};

function normStr(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

export function resolveHubStatus(input: {
  request: MatchRequestDoc | null;
  match: FoodShareMatchDoc | null;
  myUid: string;
}): FoodShareHubStatus {
  const { request, match, myUid } = input;
  if (request?.status === 'CANCELLED' || match?.status === 'CANCELLED' || match?.lifecycle === 'CANCELLED') {
    return 'cancelled';
  }
  if (!match) {
    return request?.status === 'WAITING' ? 'waiting_partner' : 'waiting_partner';
  }

  const lc = String(match.lifecycle ?? '').toUpperCase();
  if (lc === 'COMPLETED' || lc === 'DELIVERED') return 'completed';
  if (lc === 'MATCHED') return 'active_chat';
  if (lc === 'ORDER_PLACED' || lc === 'DRIVER_ASSIGNED' || lc === 'PICKED_UP') {
    return 'active_chat';
  }

  const myPaid = match.userPayments[myUid]?.paymentStatus === 'PAID';
  const payments = Object.values(match.userPayments);
  const anyPaid = payments.some((p) => p.paymentStatus === 'PAID');
  const allPaid = payments.length >= 2 && payments.every((p) => p.paymentStatus === 'PAID');

  if (
    lc === 'WAITING_FOR_PAYMENT' ||
    lc === 'WAITING_FOR_PAYMENT_CONFIRMATION' ||
    lc === 'PAYMENT_CONFIRMED'
  ) {
    if (allPaid) return 'active_chat';
    // Current user already paid — wait for partner (never show Continue Payment).
    if (myPaid) return 'waiting_partner_payment';
    if (!anyPaid) return 'match_found';
    return 'awaiting_payment';
  }

  if (request?.status === 'MATCHED') return 'match_found';
  return 'awaiting_payment';
}

export function buildCountdownLabel(input: {
  status: FoodShareHubStatus;
  joinedAtMs: number | null;
  expiresAtMs: number | null;
}): string | null {
  if (input.status === 'waiting_partner') {
    if (input.expiresAtMs != null) return formatTimeRemaining(input.expiresAtMs);
    if (input.joinedAtMs != null) {
      const mins = Math.max(0, Math.floor((Date.now() - input.joinedAtMs) / 60000));
      return mins < 1 ? 'Just joined' : `Waiting ${mins}m`;
    }
    return 'Looking for partner';
  }
  if (input.status === 'waiting_partner_payment') {
    return 'Waiting for partner to pay';
  }
  if (input.status === 'awaiting_payment' || input.status === 'match_found') {
    return 'Complete payment to activate chat';
  }
  if (input.status === 'active_chat') return null;
  return null;
}

export function hubItemFromWaiting(input: {
  request: MatchRequestDoc;
  shareRaw: Record<string, unknown> | null;
  myUid: string;
}): FoodShareHubItem {
  const share = input.shareRaw ?? {};
  const sharedPrice =
    typeof share.sharedPrice === 'number'
      ? share.sharedPrice
      : typeof share.sharingPrice === 'number'
        ? share.sharingPrice
        : 0;
  const deliveryShare =
    typeof share.deliveryShare === 'number' ? share.deliveryShare : 0;
  const totalPerUser = Math.round((sharedPrice + deliveryShare) * 100) / 100;
  const expiresAtMs = safeToMillis(share.expiresAt ?? share.expirationAt);
  const joinedAtMs = input.request.createdAtMs;
  const status: FoodShareHubStatus = 'waiting_partner';

  return {
    hubId: `wait_${input.request.adminFoodShareId}`,
    kind: 'waiting',
    adminFoodShareId: input.request.adminFoodShareId,
    matchId: null,
    status,
    foodName: normStr(share.foodName) || normStr(share.title) || 'Shared meal',
    restaurantName: normStr(share.restaurantName) || 'Restaurant',
    foodImageUrl: normStr(share.image) || normStr(share.foodImageUrl),
    joinedAtMs,
    pickupOrDelivery: resolvePickupOrDeliveryLabel(share),
    sharedPrice,
    deliveryShare,
    totalPerUser,
    totalPaid: null,
    countdownLabel: buildCountdownLabel({ status, joinedAtMs, expiresAtMs }),
    partnerFirstName: null,
    partnerPhotoUrl: null,
    lifecycle: 'WAITING_FOR_PARTNER',
    orderId: null,
    shareRaw: input.shareRaw,
    match: null,
    request: input.request,
  };
}

export function hubItemFromMatch(input: {
  match: FoodShareMatchDoc;
  request: MatchRequestDoc | null;
  shareRaw: Record<string, unknown> | null;
  myUid: string;
}): FoodShareHubItem {
  const { match, request, shareRaw, myUid } = input;
  const status = resolveHubStatus({ request, match, myUid });
  const partner =
    match.userA.uid === myUid
      ? match.userB
      : match.userB.uid === myUid
        ? match.userA
        : match.userB;
  const joinedAtMs =
    request?.createdAtMs ?? match.createdAtMs ?? safeToMillis((match as unknown as Record<string, unknown>).createdAt);
  const expiresAtMs = safeToMillis(shareRaw?.expiresAt ?? shareRaw?.expirationAt);
  const myPayment = match.userPayments[myUid];
  const totalPaid =
    myPayment?.paymentStatus === 'PAID' && typeof myPayment.amount === 'number'
      ? myPayment.amount / 100
      : myPayment?.paymentStatus === 'PAID'
        ? match.costBreakdown.totalPerUser
        : null;
  const orderIdRaw = (match as unknown as Record<string, unknown>).orderId;

  return {
    hubId: `match_${match.id}`,
    kind: 'match',
    adminFoodShareId: match.adminFoodShareId,
    matchId: match.id,
    status,
    foodName: match.foodName,
    restaurantName: match.restaurantName,
    foodImageUrl: match.foodImageUrl,
    joinedAtMs,
    pickupOrDelivery: shareRaw
      ? resolvePickupOrDeliveryLabel(shareRaw)
      : match.costBreakdown.deliveryShare > 0
        ? 'Delivery'
        : 'Pickup / Delivery',
    sharedPrice: match.costBreakdown.sharedPrice,
    deliveryShare: match.costBreakdown.deliveryShare,
    totalPerUser: match.costBreakdown.totalPerUser,
    totalPaid,
    countdownLabel: buildCountdownLabel({ status, joinedAtMs, expiresAtMs }),
    partnerFirstName: partner.firstName,
    partnerPhotoUrl: partner.photoUrl,
    lifecycle: match.lifecycle,
    orderId: typeof orderIdRaw === 'string' ? orderIdRaw : null,
    shareRaw,
    match,
    request,
  };
}

export function sortHubItems(items: FoodShareHubItem[]): FoodShareHubItem[] {
  return [...items].sort((a, b) => {
    const pa = HUB_STATUS_META[a.status].priority;
    const pb = HUB_STATUS_META[b.status].priority;
    if (pa !== pb) return pa - pb;
    return (b.joinedAtMs ?? 0) - (a.joinedAtMs ?? 0);
  });
}

export function splitHubItems(items: FoodShareHubItem[]): {
  active: FoodShareHubItem[];
  completed: FoodShareHubItem[];
  cancelled: FoodShareHubItem[];
} {
  const active: FoodShareHubItem[] = [];
  const completed: FoodShareHubItem[] = [];
  const cancelled: FoodShareHubItem[] = [];
  for (const item of items) {
    if (item.status === 'cancelled') cancelled.push(item);
    else if (item.status === 'completed') completed.push(item);
    else active.push(item);
  }
  return { active, completed, cancelled };
}
