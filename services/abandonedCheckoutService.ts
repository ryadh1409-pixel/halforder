/**
 * Client Abandoned Checkout Recovery — detects unpaid awaiting_payment orders
 * and surfaces a Home recovery card. Does not alter Stripe / payment sheet code.
 */
import {
  buildRecoveryOffer,
  canGrantRecoveryOffer,
  emptyUserStats,
  hasNewerCompletedOrder,
  isOfferActive,
  isUnpaidAwaitingCheckout,
  summarizeAbandonedItems,
} from '@/lib/abandonedCheckoutDetection';
import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  getAbandonedCheckoutConfig,
  buildOfferLabel,
} from '@/services/abandonedCheckoutConfig';
import {
  cancelAbandonedCheckoutNotificationsForOrder,
  cancelAllAbandonedCheckoutNotifications,
  syncAbandonedCheckoutNotifications,
} from '@/services/abandonedCheckoutNotifications';
import { auth, db, functions } from '@/services/firebase';
import type {
  AbandonedCheckoutHomeCard,
  AbandonedCheckoutOffer,
  AbandonedCheckoutSession,
  AbandonedCheckoutUserStats,
} from '@/types/abandonedCheckoutRecovery';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const SESSIONS = 'abandonedCheckoutSessions';
const USER_STATS = 'abandonedCheckoutUserStats';

function normStr(v: unknown, fb = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb;
}

function normNum(v: unknown, fb = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

function parseSession(
  id: string,
  data: Record<string, unknown>,
): AbandonedCheckoutSession {
  const offerRaw =
    data.offer && typeof data.offer === 'object'
      ? (data.offer as Record<string, unknown>)
      : null;
  let offer: AbandonedCheckoutOffer | null = null;
  if (offerRaw) {
    offer = {
      type: (offerRaw.type as AbandonedCheckoutOffer['type']) ?? 'free_delivery',
      value: normNum(offerRaw.value, 0),
      label:
        normStr(offerRaw.label) ||
        buildOfferLabel(
          (offerRaw.type as AbandonedCheckoutOffer['type']) ?? 'free_delivery',
          normNum(offerRaw.value, 0),
        ),
      expiresAtMs: normNum(offerRaw.expiresAtMs, 0),
      appliedToOrder: offerRaw.appliedToOrder === true,
      redeemed: offerRaw.redeemed === true,
    };
  }
  return {
    orderId: id,
    userId: normStr(data.userId),
    restaurantId: normStr(data.restaurantId),
    restaurantName: normStr(data.restaurantName, 'Restaurant'),
    totalPrice: normNum(data.totalPrice, 0),
    itemSummary: normStr(data.itemSummary, 'Your order'),
    createdAtMs:
      safeToMillis(data.createdAt) ??
      normNum(data.createdAtMs, Date.now()),
    status: (data.status as AbandonedCheckoutSession['status']) ?? 'active',
    reminder1SentAtMs:
      safeToMillis(data.reminder1SentAt) ??
      (typeof data.reminder1SentAtMs === 'number'
        ? data.reminder1SentAtMs
        : null),
    reminder2SentAtMs:
      safeToMillis(data.reminder2SentAt) ??
      (typeof data.reminder2SentAtMs === 'number'
        ? data.reminder2SentAtMs
        : null),
    recoveryAttempts: Math.max(0, Math.floor(normNum(data.recoveryAttempts, 0))),
    offer,
    notificationsOpened: Math.max(
      0,
      Math.floor(normNum(data.notificationsOpened, 0)),
    ),
  };
}

async function readUserStats(uid: string): Promise<AbandonedCheckoutUserStats> {
  try {
    const snap = await getDoc(doc(db, USER_STATS, uid));
    if (!snap.exists()) return emptyUserStats(uid);
    const d = snap.data() as Record<string, unknown>;
    return {
      uid,
      abandonmentCount: Math.max(0, Math.floor(normNum(d.abandonmentCount, 0))),
      offersReceived: Math.max(0, Math.floor(normNum(d.offersReceived, 0))),
      offersRedeemed: Math.max(0, Math.floor(normNum(d.offersRedeemed, 0))),
      lastOfferAtMs:
        typeof d.lastOfferAtMs === 'number' ? d.lastOfferAtMs : null,
      lastAbandonmentAtMs:
        typeof d.lastAbandonmentAtMs === 'number'
          ? d.lastAbandonmentAtMs
          : null,
      suspiciousAbandonStreak: Math.max(
        0,
        Math.floor(normNum(d.suspiciousAbandonStreak, 0)),
      ),
    };
  } catch {
    return emptyUserStats(uid);
  }
}

async function bumpAbandonmentStats(uid: string): Promise<AbandonedCheckoutUserStats> {
  const prev = await readUserStats(uid);
  const next: AbandonedCheckoutUserStats = {
    ...prev,
    abandonmentCount: prev.abandonmentCount + 1,
    lastAbandonmentAtMs: Date.now(),
    suspiciousAbandonStreak: prev.suspiciousAbandonStreak + 1,
  };
  await setDoc(
    doc(db, USER_STATS, uid),
    { ...next, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return next;
}

/**
 * Scan the signed-in user's recent unpaid checkout orders and sync recovery sessions.
 * Returns the best Home recovery card (or null).
 */
export async function loadAbandonedCheckoutHomeCard(
  uid: string,
): Promise<AbandonedCheckoutHomeCard | null> {
  const config = await getAbandonedCheckoutConfig();
  if (!config.enabled || !config.enableRecoveryAutomation) return null;

  const q = query(
    collection(db, 'orders'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  const snap = await getDocs(q);
  const now = Date.now();

  type OrderRow = {
    id: string;
    data: Record<string, unknown>;
    createdAtMs: number;
  };
  const rows: OrderRow[] = snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as Record<string, unknown>,
    createdAtMs: safeToMillis(d.data().createdAt) ?? 0,
  }));

  const history = rows.map((r) => ({
    createdAtMs: r.createdAtMs,
    paymentStatus: String(r.data.paymentStatus ?? ''),
    status: String(r.data.status ?? ''),
  }));

  let best: AbandonedCheckoutHomeCard | null = null;
  let userStats = await readUserStats(uid);

  for (const row of rows) {
    if (!isUnpaidAwaitingCheckout(row.data)) continue;
    if (!row.createdAtMs) continue;

    // Not abandoned yet — still within first delay window for detection display,
    // but card can show after delay1 so user sees it when returning.
    const ageMin = (now - row.createdAtMs) / 60000;
    if (ageMin < Math.min(2, config.notificationDelay1Minutes)) continue;

    if (hasNewerCompletedOrder(row.createdAtMs, history)) continue;

    // Restaurant cancelled / completed elsewhere
    if (isOrderCompleted(row.data)) continue;

    const restaurantObj =
      row.data.restaurant && typeof row.data.restaurant === 'object'
        ? (row.data.restaurant as Record<string, unknown>)
        : null;
    const restaurantName =
      normStr(row.data.restaurantName) ||
      normStr(restaurantObj?.name) ||
      'Restaurant';
    const restaurantId =
      normStr(row.data.restaurantId) || normStr(row.data.venueId);
    const totalPrice = Math.max(
      0,
      normNum(row.data.totalPrice, normNum(row.data.total, 0)),
    );
    const itemSummary = summarizeAbandonedItems(row.data.items);

    const sessionRef = doc(db, SESSIONS, row.id);
    const existing = await getDoc(sessionRef);
    let session: AbandonedCheckoutSession;

    if (!existing.exists()) {
      userStats = await bumpAbandonmentStats(uid);
      session = {
        orderId: row.id,
        userId: uid,
        restaurantId,
        restaurantName,
        totalPrice,
        itemSummary,
        createdAtMs: row.createdAtMs,
        status: 'active',
        reminder1SentAtMs: null,
        reminder2SentAtMs: null,
        recoveryAttempts: 0,
        offer: null,
        notificationsOpened: 0,
      };
      await setDoc(
        sessionRef,
        {
          ...session,
          countedInAnalytics: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      session = parseSession(row.id, existing.data() as Record<string, unknown>);
      if (session.status === 'recovered' || session.status === 'cancelled') {
        continue;
      }
      // Expire offer
      if (session.offer && !isOfferActive(session.offer, now)) {
        session = { ...session, offer: null, status: 'expired' };
        await setDoc(
          sessionRef,
          { offer: null, status: 'expired', updatedAt: serverTimestamp() },
          { merge: true },
        );
        continue;
      }
    }

    // Maybe attach offer (anti-abuse gated)
    if (
      !session.offer &&
      canGrantRecoveryOffer({ config, userStats, nowMs: now }) &&
      session.recoveryAttempts < config.maxRecoveryAttemptsPerOrder
    ) {
      const offer = buildRecoveryOffer({
        type: config.offerType,
        value: config.offerValue,
        expiresInMinutes: config.offerExpirationMinutes,
        nowMs: now,
      });
      session = {
        ...session,
        offer,
        recoveryAttempts: session.recoveryAttempts + 1,
      };
      userStats = {
        ...userStats,
        offersReceived: userStats.offersReceived + 1,
        lastOfferAtMs: now,
        suspiciousAbandonStreak: 0,
      };
      await setDoc(
        sessionRef,
        {
          offer,
          recoveryAttempts: session.recoveryAttempts,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await setDoc(
        doc(db, USER_STATS, uid),
        { ...userStats, updatedAt: serverTimestamp() },
        { merge: true },
      );
    }

    if (session.status !== 'active' && session.status !== 'expired') continue;
    // Reactivate expired-without-offer as active for card if still unpaid
    if (session.status === 'expired' && !session.offer) continue;

    const offer =
      session.offer && isOfferActive(session.offer, now) ? session.offer : null;
    const card: AbandonedCheckoutHomeCard = {
      orderId: row.id,
      restaurantName,
      itemSummary,
      totalPrice,
      offer,
      offerSecondsRemaining: offer
        ? Math.max(0, Math.floor((offer.expiresAtMs - now) / 1000))
        : null,
    };

    // Prefer newest abandoned checkout
    if (!best) best = card;
  }

  if (best) {
    const match = rows.find((r) => r.id === best.orderId);
    void syncAbandonedCheckoutNotifications({
      uid,
      orderId: best.orderId,
      restaurantName: best.restaurantName,
      config,
      hasOffer: best.offer != null,
      orderCreatedAtMs: match?.createdAtMs,
    });
  } else {
    void cancelAllAbandonedCheckoutNotifications();
  }

  // Clean up sessions for paid / cancelled / superseded orders in this batch
  for (const row of rows) {
    const pay = String(row.data.paymentStatus ?? '').toLowerCase();
    const status = String(row.data.status ?? '').toLowerCase();
    if (pay === 'paid' || status === 'cancelled' || status === 'canceled') {
      const existing = await getDoc(doc(db, SESSIONS, row.id));
      if (existing.exists()) {
        const s = existing.data() as Record<string, unknown>;
        if (s.status === 'active') {
          await setDoc(
            doc(db, SESSIONS, row.id),
            {
              status: pay === 'paid' ? 'recovered' : 'cancelled',
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
          void cancelAbandonedCheckoutNotificationsForOrder(row.id);
        }
      }
    }
  }

  return best;
}

export async function markAbandonedCheckoutRecovered(
  orderId: string,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !orderId) return;
  try {
    await setDoc(
      doc(db, SESSIONS, orderId),
      {
        status: 'recovered',
        recoveredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    void cancelAbandonedCheckoutNotificationsForOrder(orderId);
  } catch {
    /* ignore */
  }
}

export function checkoutPathForRecovery(orderId: string): string {
  return `/checkout?orderId=${encodeURIComponent(orderId)}`;
}

/** Apply recovery offer to the unpaid order (server), then return checkout path. */
export async function prepareAbandonedCheckoutComplete(
  orderId: string,
): Promise<{ path: string }> {
  const id = orderId.trim();
  if (!id) throw new Error('Missing order');
  try {
    const call = httpsCallable<
      { orderId: string },
      { ok: boolean; orderId: string }
    >(functions, 'applyAbandonedCheckoutRecoveryOffer');
    await call({ orderId: id });
  } catch {
    // Soft-fail: still open existing checkout even if offer apply is delayed.
  }
  return { path: checkoutPathForRecovery(id) };
}

export async function bumpAbandonedCheckoutNotificationOpened(
  orderId: string,
): Promise<void> {
  const id = orderId.trim();
  if (!id) return;
  try {
    const call = httpsCallable<{ orderId: string }, { ok: boolean }>(
      functions,
      'recordAbandonedCheckoutNotificationOpen',
    );
    await call({ orderId: id });
  } catch {
    /* ignore */
  }
}
