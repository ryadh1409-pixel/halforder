/**
 * Enrichment + contact-customer for Admin Payment Details (read-only Stripe side).
 */
import {
  adminReplySupportMessage,
} from '@/services/adminSupportInbox';
import { createInboxNotification } from '@/services/foodShareInbox';
import { auth, db } from '@/services/firebase';
import { appendPaymentSupportHistoryMessage } from '@/services/paymentAdminMeta';
import { sendExpoPush } from '@/services/sendExpoPush';
import type { AdminPaymentTransaction } from '@/types/adminPaymentTransaction';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

export type PaymentCustomerProfile = {
  uid: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  photoURL: string | null;
};

export type PaymentOrderEnrichment = {
  orderStatus: string | null;
  deliveryStatus: string | null;
  refundStatus: string | null;
  updatedAtMs: number | null;
  restaurantAcceptedAtMs: number | null;
  driverAssignedAtMs: number | null;
  deliveredAtMs: number | null;
  cancelledAtMs: number | null;
  customerJoinedAtMs: number | null;
};

export type PaymentCardExtras = {
  brand: string | null;
  last4: string | null;
  expiration: string | null;
  funding: string | null;
  country: string | null;
};

export type PaymentTimelineEvent = {
  id: string;
  label: string;
  atMs: number | null;
  active: boolean;
};

const STRIPE_UNAVAILABLE = 'Not available from Stripe.';

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function tokenFromUserData(data: Record<string, unknown>): string | null {
  for (const key of ['expoPushToken', 'pushToken', 'fcmToken'] as const) {
    const t = data[key];
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

export function stripeFieldOrUnavailable(
  value: string | null | undefined,
): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return STRIPE_UNAVAILABLE;
}

export async function fetchPaymentCustomerProfile(
  uid: string,
): Promise<PaymentCustomerProfile> {
  const empty: PaymentCustomerProfile = {
    uid,
    name: null,
    email: null,
    phone: null,
    photoURL: null,
  };
  if (!uid) return empty;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return empty;
    const data = snap.data() as Record<string, unknown>;
    return {
      uid,
      name: readString(data.displayName, data.name, data.fullName),
      email: readString(data.email),
      phone: readString(data.phoneNumber, data.phone, data.mobile),
      photoURL: readString(data.photoURL, data.avatarUrl, data.profilePhoto),
    };
  } catch {
    return empty;
  }
}

export async function fetchPaymentDocExtras(paymentId: string): Promise<{
  card: PaymentCardExtras;
  refundStatus: string | null;
  updatedAtMs: number | null;
  paymentMethod: string | null;
}> {
  const emptyCard: PaymentCardExtras = {
    brand: null,
    last4: null,
    expiration: null,
    funding: null,
    country: null,
  };
  try {
    const snap = await getDoc(doc(db, 'paymentTransactions', paymentId));
    if (!snap.exists()) {
      return {
        card: emptyCard,
        refundStatus: null,
        updatedAtMs: null,
        paymentMethod: null,
      };
    }
    const data = snap.data() as Record<string, unknown>;
    const expMonth =
      typeof data.paymentMethodExpMonth === 'number'
        ? data.paymentMethodExpMonth
        : typeof data.cardExpMonth === 'number'
          ? data.cardExpMonth
          : null;
    const expYear =
      typeof data.paymentMethodExpYear === 'number'
        ? data.paymentMethodExpYear
        : typeof data.cardExpYear === 'number'
          ? data.cardExpYear
          : null;
    let expiration: string | null = null;
    if (
      typeof expMonth === 'number' &&
      Number.isFinite(expMonth) &&
      typeof expYear === 'number' &&
      Number.isFinite(expYear)
    ) {
      expiration = `${String(expMonth).padStart(2, '0')}/${String(expYear).slice(-2)}`;
    } else {
      expiration = readString(
        data.paymentMethodExpiration,
        data.cardExpiration,
      );
    }

    return {
      card: {
        brand: readString(data.paymentMethodBrand, data.cardBrand),
        last4: readString(data.paymentMethodLast4, data.cardLast4),
        expiration,
        funding: readString(data.paymentMethodFunding, data.cardFunding),
        country: readString(data.paymentMethodCountry, data.cardCountry),
      },
      refundStatus: readString(data.refundStatus, data.refund_status),
      updatedAtMs: safeToMillis(data.updatedAt),
      paymentMethod: readString(
        data.paymentMethodLabel,
        data.paymentMethodType,
        data.paymentMethod,
      ),
    };
  } catch {
    return {
      card: emptyCard,
      refundStatus: null,
      updatedAtMs: null,
      paymentMethod: null,
    };
  }
}

export async function fetchPaymentOrderEnrichment(
  orderId: string | null,
  matchId: string | null,
): Promise<PaymentOrderEnrichment> {
  const empty: PaymentOrderEnrichment = {
    orderStatus: null,
    deliveryStatus: null,
    refundStatus: null,
    updatedAtMs: null,
    restaurantAcceptedAtMs: null,
    driverAssignedAtMs: null,
    deliveredAtMs: null,
    cancelledAtMs: null,
    customerJoinedAtMs: null,
  };

  const tryOrder = async (id: string) => {
    const snap = await getDoc(doc(db, 'orders', id));
    if (!snap.exists()) return null;
    return snap.data() as Record<string, unknown>;
  };

  try {
    let data: Record<string, unknown> | null = null;
    if (orderId) data = await tryOrder(orderId);
    if (!data && matchId) data = await tryOrder(matchId);

    let matchData: Record<string, unknown> | null = null;
    if (matchId) {
      for (const col of ['matches', 'foodShareMatches'] as const) {
        try {
          const m = await getDoc(doc(db, col, matchId));
          if (m.exists()) {
            matchData = m.data() as Record<string, unknown>;
            break;
          }
        } catch {
          /* optional */
        }
      }
    }

    if (!data && !matchData) return empty;

    const d = data ?? {};
    const md = matchData ?? {};

    return {
      orderStatus: readString(d.status, d.orderStatus, md.status, md.lifecycle),
      deliveryStatus: readString(d.deliveryStatus, md.deliveryStatus),
      refundStatus: readString(d.refundStatus, md.refundStatus),
      updatedAtMs: safeToMillis(d.updatedAt) ?? safeToMillis(md.updatedAt),
      restaurantAcceptedAtMs:
        safeToMillis(d.restaurantAcceptedAt) ??
        safeToMillis(d.acceptedAt) ??
        safeToMillis(md.restaurantAcceptedAt),
      driverAssignedAtMs:
        safeToMillis(d.driverAssignedAt) ??
        safeToMillis(md.driverAssignedAt),
      deliveredAtMs:
        safeToMillis(d.deliveredAt) ??
        safeToMillis(d.completedAt) ??
        safeToMillis(md.deliveredAt),
      cancelledAtMs:
        safeToMillis(d.cancelledAt) ?? safeToMillis(md.cancelledAt),
      customerJoinedAtMs:
        safeToMillis(d.customerJoinedAt) ??
        safeToMillis(md.joinedAt) ??
        safeToMillis(md.createdAt),
    };
  } catch {
    return empty;
  }
}

export function buildPaymentTimeline(
  payment: AdminPaymentTransaction,
  order: PaymentOrderEnrichment,
): PaymentTimelineEvent[] {
  const status = payment.status;
  const orderStatus = (order.orderStatus ?? '').toLowerCase();
  const delivery = (order.deliveryStatus ?? '').toLowerCase();

  const cancelled =
    order.cancelledAtMs != null || orderStatus.includes('cancel');
  const refunded =
    status === 'refunded' ||
    (order.refundStatus ?? '').toLowerCase().includes('refund');
  const delivered =
    order.deliveredAtMs != null ||
    delivery.includes('deliver') ||
    orderStatus.includes('deliver') ||
    orderStatus.includes('complete');
  const driverAssigned =
    order.driverAssignedAtMs != null ||
    delivery.includes('driver') ||
    Boolean(payment.driverId);
  const restaurantAccepted = order.restaurantAcceptedAtMs != null;
  const joined = order.customerJoinedAtMs != null;
  const confirmed = status === 'paid' || payment.paidAtMs != null;

  return [
    {
      id: 'created',
      label: 'Payment created',
      atMs: payment.createdAtMs,
      active: payment.createdAtMs != null,
    },
    {
      id: 'confirmed',
      label: 'Payment confirmed',
      atMs: payment.paidAtMs,
      active: confirmed,
    },
    {
      id: 'joined',
      label: 'Customer joined order',
      atMs: order.customerJoinedAtMs,
      active: joined,
    },
    {
      id: 'restaurant',
      label: 'Restaurant accepted',
      atMs: order.restaurantAcceptedAtMs,
      active: restaurantAccepted,
    },
    {
      id: 'driver',
      label: 'Driver assigned',
      atMs: order.driverAssignedAtMs,
      active: driverAssigned,
    },
    {
      id: 'delivered',
      label: 'Delivered',
      atMs: order.deliveredAtMs,
      active: delivered,
    },
    {
      id: 'cancelled',
      label: 'Cancelled',
      atMs: order.cancelledAtMs,
      active: cancelled && !refunded,
    },
    {
      id: 'refunded',
      label: 'Refunded',
      atMs: refunded ? (order.updatedAtMs ?? payment.paidAtMs) : null,
      active: refunded,
    },
  ];
}

function formatContextBlock(input: {
  orderId: string | null;
  paymentId: string;
  restaurant: string | null;
  amountLabel: string;
  dateLabel: string;
  timeLabel: string;
  matchId: string | null;
  customerName: string | null;
  customMessage: string;
}): string {
  return [
    input.customMessage.trim(),
    '',
    '—',
    'Order context (attached by HalfOrder Support)',
    `Customer: ${input.customerName ?? '—'}`,
    `Order ID: ${input.orderId ?? '—'}`,
    `Payment ID: ${input.paymentId}`,
    `Match ID: ${input.matchId ?? '—'}`,
    `Restaurant: ${input.restaurant ?? '—'}`,
    `Amount: ${input.amountLabel}`,
    `Date: ${input.dateLabel}`,
    `Time: ${input.timeLabel}`,
  ].join('\n');
}

async function ensureAdminSupportThreadMessage(input: {
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  orderId: string | null;
  paymentId: string;
  body: string;
}): Promise<void> {
  const caller = auth.currentUser;
  if (!caller) return;
  const threadRef = doc(db, 'adminSupportThreads', input.customerId);
  const existing = await getDoc(threadRef);

  if (!existing.exists()) {
    await setDoc(threadRef, {
      userId: input.customerId,
      userName: input.customerName ?? 'Customer',
      userEmail: input.customerEmail,
      lastMessage: input.body.slice(0, 500),
      lastSender: 'admin',
      unreadAdmin: 0,
      unreadUser: 1,
      archived: false,
      orderId: input.orderId,
      paymentId: input.paymentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'adminSupportThreads', input.customerId, 'messages'), {
      sender: 'admin',
      senderUid: caller.uid,
      body: input.body,
      createdAt: serverTimestamp(),
      readByAdmin: true,
      readByUser: false,
      paymentId: input.paymentId,
      delivered: true,
    });
    return;
  }

  try {
    await adminReplySupportMessage(input.customerId, input.body);
    await updateDoc(threadRef, {
      paymentId: input.paymentId,
      ...(input.orderId ? { orderId: input.orderId } : {}),
    });
  } catch {
    await addDoc(collection(db, 'adminSupportThreads', input.customerId, 'messages'), {
      sender: 'admin',
      senderUid: caller.uid,
      body: input.body,
      createdAt: serverTimestamp(),
      readByAdmin: true,
      readByUser: false,
      paymentId: input.paymentId,
      delivered: true,
    });
    await updateDoc(threadRef, {
      lastMessage: input.body.slice(0, 500),
      lastSender: 'admin',
      paymentId: input.paymentId,
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Contact customer from Payment Details:
 * inbox + push + payment conversation history + support thread.
 */
export async function sendPaymentCustomerSupportMessage(input: {
  payment: AdminPaymentTransaction;
  customMessage: string;
  amountLabel: string;
  customerEmail?: string | null;
}): Promise<void> {
  const caller = auth.currentUser;
  if (!caller) throw new Error('Sign in required');
  const custom = input.customMessage.trim();
  if (!custom) throw new Error('Enter a message');
  const customerId = input.payment.customerId?.trim();
  if (!customerId) throw new Error('Customer UID missing');

  const createdMs = input.payment.createdAtMs ?? Date.now();
  const created = new Date(createdMs);
  const fullBody = formatContextBlock({
    orderId: input.payment.orderId,
    paymentId: input.payment.id,
    restaurant: input.payment.restaurantName,
    amountLabel: input.amountLabel,
    dateLabel: created.toLocaleDateString(),
    timeLabel: created.toLocaleTimeString(),
    matchId: input.payment.matchId,
    customerName: input.payment.customerName,
    customMessage: custom,
  });

  await createInboxNotification({
    recipientUid: customerId,
    type: 'admin_message',
    title: 'HalfOrder',
    body: fullBody,
    deepLink: '/inbox',
    matchId: input.payment.matchId,
    skipPush: true,
  });

  let token: string | null = null;
  try {
    const userSnap = await getDoc(doc(db, 'users', customerId));
    if (userSnap.exists()) {
      token = tokenFromUserData(userSnap.data() as Record<string, unknown>);
    }
  } catch {
    /* ignore */
  }
  if (token) {
    await sendExpoPush(
      [token],
      'HalfOrder',
      'New message from HalfOrder Support',
      {
        type: 'admin_message',
        deepLink: '/inbox',
        paymentId: input.payment.id,
      },
      { priority: 'high', channelId: 'halforder', badge: 1 },
    );
  }

  await appendPaymentSupportHistoryMessage({
    paymentId: input.payment.id,
    sender: 'admin',
    body: fullBody,
    delivered: true,
    read: false,
  });

  try {
    await ensureAdminSupportThreadMessage({
      customerId,
      customerName: input.payment.customerName,
      customerEmail: input.customerEmail ?? null,
      orderId: input.payment.orderId,
      paymentId: input.payment.id,
      body: fullBody,
    });
  } catch {
    /* history already stored on payment meta */
  }
}
