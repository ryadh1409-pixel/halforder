/**
 * Abandoned Checkout Recovery — scheduled automation + offer apply callable.
 * Isolated from Stripe / payment sheet code. Uses Admin SDK for order fee patches.
 */
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

const db = getFirestore();
const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const SESSIONS = "abandonedCheckoutSessions";
const USER_STATS = "abandonedCheckoutUserStats";
const CONFIG_DOC = "platformSettings/abandonedCheckoutRecovery";
const ANALYTICS_DOC = "platformSettings/abandonedCheckoutAnalytics";

type OfferType =
  | "free_delivery"
  | "free_service_fee"
  | "percent_discount"
  | "fixed_discount"
  | "reward_points";

type Config = {
  enabled: boolean;
  enableRecoveryAutomation: boolean;
  enablePushNotifications: boolean;
  enableRecoveryOffers: boolean;
  enableReminderNotifications: boolean;
  notificationDelay1Minutes: number;
  notificationDelay2Minutes: number;
  minAbandonedCheckoutsBeforeOffer: number;
  offerType: OfferType;
  offerValue: number;
  offerExpirationMinutes: number;
  cooldownHoursBetweenOffers: number;
  maxOffersPerCustomer: number;
  maxRecoveryAttemptsPerOrder: number;
  previewNotificationTitle: string;
  previewNotificationBody: string;
  previewOfferTitle: string;
  previewOfferBody: string;
};

const DEFAULT_CONFIG: Config = {
  enabled: false,
  enableRecoveryAutomation: true,
  enablePushNotifications: true,
  enableRecoveryOffers: true,
  enableReminderNotifications: true,
  notificationDelay1Minutes: 10,
  notificationDelay2Minutes: 30,
  minAbandonedCheckoutsBeforeOffer: 2,
  offerType: "free_delivery",
  offerValue: 0,
  offerExpirationMinutes: 60,
  cooldownHoursBetweenOffers: 72,
  maxOffersPerCustomer: 3,
  maxRecoveryAttemptsPerOrder: 2,
  previewNotificationTitle: "🍔 Your order is still waiting for you.",
  previewNotificationBody: "Hungry? Complete your order before it expires.",
  previewOfferTitle: "🎁 Limited-Time Offer",
  previewOfferBody: "Complete your order and unlock a recovery reward.",
};

type Offer = {
  type: OfferType;
  value: number;
  label: string;
  expiresAtMs: number;
  appliedToOrder: boolean;
  redeemed: boolean;
};

function clamp(n: unknown, fb: number, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fb;
  return Math.min(max, Math.max(min, v));
}

function str(v: unknown, fb = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fb;
}

function num(v: unknown, fb = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}

function tsMs(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis();
  if (v && typeof v === "object" && typeof (v as {toMillis?: unknown}).toMillis === "function") {
    try {
      return (v as {toMillis: () => number}).toMillis();
    } catch {
      return null;
    }
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function parseOfferType(raw: unknown): OfferType {
  switch (raw) {
  case "free_delivery":
  case "free_service_fee":
  case "percent_discount":
  case "fixed_discount":
  case "reward_points":
    return raw;
  default:
    return DEFAULT_CONFIG.offerType;
  }
}

function parseConfig(raw: Record<string, unknown> | undefined): Config {
  const d = raw ?? {};
  return {
    enabled: d.enabled === true,
    enableRecoveryAutomation: d.enableRecoveryAutomation !== false,
    enablePushNotifications: d.enablePushNotifications !== false,
    enableRecoveryOffers: d.enableRecoveryOffers !== false,
    enableReminderNotifications: d.enableReminderNotifications !== false,
    notificationDelay1Minutes: clamp(d.notificationDelay1Minutes, DEFAULT_CONFIG.notificationDelay1Minutes, 1, 24 * 60),
    notificationDelay2Minutes: clamp(d.notificationDelay2Minutes, DEFAULT_CONFIG.notificationDelay2Minutes, 1, 24 * 60),
    minAbandonedCheckoutsBeforeOffer: clamp(d.minAbandonedCheckoutsBeforeOffer, DEFAULT_CONFIG.minAbandonedCheckoutsBeforeOffer, 2, 20),
    offerType: parseOfferType(d.offerType),
    offerValue: clamp(d.offerValue, DEFAULT_CONFIG.offerValue, 0, 10000),
    offerExpirationMinutes: clamp(d.offerExpirationMinutes, DEFAULT_CONFIG.offerExpirationMinutes, 5, 7 * 24 * 60),
    cooldownHoursBetweenOffers: clamp(d.cooldownHoursBetweenOffers, DEFAULT_CONFIG.cooldownHoursBetweenOffers, 1, 720),
    maxOffersPerCustomer: clamp(d.maxOffersPerCustomer, DEFAULT_CONFIG.maxOffersPerCustomer, 1, 50),
    maxRecoveryAttemptsPerOrder: clamp(d.maxRecoveryAttemptsPerOrder, DEFAULT_CONFIG.maxRecoveryAttemptsPerOrder, 1, 5),
    previewNotificationTitle: str(d.previewNotificationTitle, DEFAULT_CONFIG.previewNotificationTitle),
    previewNotificationBody: str(d.previewNotificationBody, DEFAULT_CONFIG.previewNotificationBody),
    previewOfferTitle: str(d.previewOfferTitle, DEFAULT_CONFIG.previewOfferTitle),
    previewOfferBody: str(d.previewOfferBody, DEFAULT_CONFIG.previewOfferBody),
  };
}

function offerLabel(type: OfferType, value: number): string {
  switch (type) {
  case "free_delivery":
    return "Free Delivery";
  case "free_service_fee":
    return "Free Service Fee";
  case "percent_discount":
    return `${Math.round(value)}% Off`;
  case "fixed_discount":
    return `$${value.toFixed(2)} Off`;
  case "reward_points":
    return `${Math.round(value)} Bonus Points`;
  default:
    return "Recovery Offer";
  }
}

function isUnpaidAwaiting(order: Record<string, unknown>): boolean {
  const pay = str(order.paymentStatus).toLowerCase();
  const status = str(order.status).toLowerCase();
  if (order.expired === true) return false;
  if (pay === "paid") return false;
  if (status === "cancelled" || status === "canceled") return false;
  return pay === "unpaid" && status === "awaiting_payment";
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function applyOfferPricing(input: {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  promoDiscount: number;
  taxRate: number;
  offer: Offer;
}): {
  deliveryFee: number;
  serviceFee: number;
  promoDiscount: number;
  totalPrice: number;
  tax: number;
} {
  let deliveryFee = Math.max(0, input.deliveryFee);
  let serviceFee = Math.max(0, input.serviceFee);
  let promoDiscount = Math.max(0, input.promoDiscount);

  switch (input.offer.type) {
  case "free_delivery":
    deliveryFee = 0;
    break;
  case "free_service_fee":
    serviceFee = 0;
    break;
  case "percent_discount": {
    const pct = Math.min(100, Math.max(0, input.offer.value));
    promoDiscount += (input.subtotal * pct) / 100;
    break;
  }
  case "fixed_discount":
    promoDiscount += Math.max(0, input.offer.value);
    break;
  default:
    break;
  }

  const taxable = Math.max(0, input.subtotal + deliveryFee + serviceFee - promoDiscount);
  const tax = roundMoney(taxable * Math.max(0, input.taxRate));
  return {
    deliveryFee: roundMoney(deliveryFee),
    serviceFee: roundMoney(serviceFee),
    promoDiscount: roundMoney(promoDiscount),
    tax,
    totalPrice: roundMoney(taxable + tax),
  };
}

async function loadConfig(): Promise<Config> {
  const snap = await db.doc(CONFIG_DOC).get();
  return parseConfig(snap.exists ? (snap.data() as Record<string, unknown>) : undefined);
}

async function bumpAnalytics(patch: Record<string, number>): Promise<void> {
  const data: Record<string, unknown> = {updatedAt: FieldValue.serverTimestamp()};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== 0) data[k] = FieldValue.increment(v);
  }
  await db.doc(ANALYTICS_DOC).set(data, {merge: true});
}

async function expoTokenFor(uid: string): Promise<string | null> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const row = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  if (row.notificationsEnabled === false) return null;
  for (const key of ["expoPushToken", "pushToken", "fcmToken"]) {
    const token = str(row[key]);
    if (token) return token;
  }
  const tokenSnap = await db.doc(`users/${uid}/pushToken/default`).get();
  const token = tokenSnap.exists ? str(tokenSnap.data()?.token) : "";
  return token || null;
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        to: token,
        title,
        body,
        sound: "default",
        priority: "high",
        data,
      }]),
    });
    return res.ok;
  } catch (error) {
    logger.warn("[abandoned-checkout] expo_push_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function readUserStats(uid: string): Promise<{
  abandonmentCount: number;
  offersReceived: number;
  lastOfferAtMs: number | null;
  suspiciousAbandonStreak: number;
}> {
  const snap = await db.collection(USER_STATS).doc(uid).get();
  if (!snap.exists) {
    return {abandonmentCount: 0, offersReceived: 0, lastOfferAtMs: null, suspiciousAbandonStreak: 0};
  }
  const d = snap.data() as Record<string, unknown>;
  return {
    abandonmentCount: Math.max(0, Math.floor(num(d.abandonmentCount, 0))),
    offersReceived: Math.max(0, Math.floor(num(d.offersReceived, 0))),
    lastOfferAtMs: typeof d.lastOfferAtMs === "number" ? d.lastOfferAtMs : null,
    suspiciousAbandonStreak: Math.max(0, Math.floor(num(d.suspiciousAbandonStreak, 0))),
  };
}

function canGrantOffer(config: Config, stats: Awaited<ReturnType<typeof readUserStats>>, now: number): boolean {
  if (!config.enabled || !config.enableRecoveryOffers || !config.enableRecoveryAutomation) return false;
  if (stats.abandonmentCount < config.minAbandonedCheckoutsBeforeOffer) return false;
  if (stats.offersReceived >= config.maxOffersPerCustomer) return false;
  const last = stats.lastOfferAtMs ?? 0;
  const cooldownMs = config.cooldownHoursBetweenOffers * 60 * 60 * 1000;
  if (last > 0 && now - last < cooldownMs) return false;
  if (stats.suspiciousAbandonStreak >= 5) return false;
  return true;
}

function summarizeItems(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return "Your order";
  const names = items.slice(0, 3).map((row) => {
    if (!row || typeof row !== "object") return "";
    const name = str((row as {name?: unknown}).name);
    const qty = (row as {qty?: unknown}).qty;
    if (!name) return "";
    const q = typeof qty === "number" && qty > 1 ? `${Math.floor(qty)}× ` : "";
    return `${q}${name}`;
  }).filter(Boolean);
  if (names.length === 0) return "Your order";
  const extra = items.length > 3 ? ` +${items.length - 3} more` : "";
  return `${names.join(", ")}${extra}`;
}

async function applyOfferToUnpaidOrder(orderId: string, offer: Offer): Promise<boolean> {
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const order = snap.data() as Record<string, unknown>;
  if (!isUnpaidAwaiting(order)) return false;

  if (offer.type === "reward_points") {
    await ref.set({
      abandonedCheckoutOffer: offer,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return true;
  }

  const subtotal = Math.max(0, num(order.subtotal, num(order.foodSubtotal, 0)));
  const deliveryFee = Math.max(0, num(order.deliveryFee, 0));
  const serviceFee = Math.max(0, num(order.serviceFee, 0));
  const promoDiscount = Math.max(0, num(order.promoDiscount, 0));
  const taxRate = Math.max(0, num(order.taxRate, 0.13));
  const priced = applyOfferPricing({
    subtotal,
    deliveryFee,
    serviceFee,
    promoDiscount,
    taxRate,
    offer,
  });

  await ref.set({
    deliveryFee: priced.deliveryFee,
    serviceFee: priced.serviceFee,
    promoDiscount: priced.promoDiscount,
    tax: priced.tax,
    hst: priced.tax,
    totalPrice: priced.totalPrice,
    abandonedCheckoutOffer: {...offer, appliedToOrder: true},
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return true;
}

async function hasNewerPaidOrder(uid: string, abandonedCreatedAtMs: number): Promise<boolean> {
  const snap = await db.collection("orders")
    .where("userId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(8)
    .get();
  for (const doc of snap.docs) {
    const d = doc.data();
    const ms = tsMs(d.createdAt) ?? 0;
    if (ms <= abandonedCreatedAtMs) continue;
    if (str(d.paymentStatus).toLowerCase() === "paid") return true;
  }
  return false;
}

async function processSession(
  sessionId: string,
  session: Record<string, unknown>,
  config: Config,
  now: number,
): Promise<void> {
  const orderId = sessionId;
  const userId = str(session.userId);
  if (!userId) return;

  const orderSnap = await db.collection("orders").doc(orderId).get();
  if (!orderSnap.exists) {
    await db.collection(SESSIONS).doc(orderId).set({
      status: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return;
  }
  const order = orderSnap.data() as Record<string, unknown>;
  const createdAtMs = num(session.createdAtMs, tsMs(order.createdAt) ?? now);
  const pay = str(order.paymentStatus).toLowerCase();
  const status = str(order.status).toLowerCase();

  if (pay === "paid") {
    const offer = session.offer && typeof session.offer === "object" ?
      (session.offer as Offer) :
      null;
    const already = session.status === "recovered";
    if (!already) {
      const recoveryMs = Math.max(0, now - createdAtMs);
      await db.collection(SESSIONS).doc(orderId).set({
        status: "recovered",
        recoveredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        offer: offer ? {...offer, redeemed: true} : null,
      }, {merge: true});
      await bumpAnalytics({
        recoveredOrders: 1,
        offersRedeemed: offer ? 1 : 0,
        totalRecoveryTimeMs: recoveryMs,
        recoveredWithTimingCount: 1,
      });
      if (offer?.type === "reward_points" && offer.value > 0 && !offer.redeemed) {
        await db.collection("users").doc(userId).set({
          credits: FieldValue.increment(Math.round(offer.value)),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      }
      await db.collection(USER_STATS).doc(userId).set({
        suspiciousAbandonStreak: 0,
        offersRedeemed: FieldValue.increment(offer ? 1 : 0),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    return;
  }

  if (
    order.expired === true ||
    status === "cancelled" ||
    status === "canceled" ||
    !isUnpaidAwaiting(order)
  ) {
    await db.collection(SESSIONS).doc(orderId).set({
      status: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return;
  }

  if (await hasNewerPaidOrder(userId, createdAtMs)) {
    await db.collection(SESSIONS).doc(orderId).set({
      status: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return;
  }

  if (session.status !== "active") return;

  if (session.countedInAnalytics !== true) {
    await db.collection(SESSIONS).doc(orderId).set({
      countedInAnalytics: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    await bumpAnalytics({abandonedCheckouts: 1});
  }

  const reminder1SentAtMs = tsMs(session.reminder1SentAt) ??
    (typeof session.reminder1SentAtMs === "number" ? session.reminder1SentAtMs : null);
  const reminder2SentAtMs = tsMs(session.reminder2SentAt) ??
    (typeof session.reminder2SentAtMs === "number" ? session.reminder2SentAtMs : null);

  let offer = session.offer && typeof session.offer === "object" ?
    (session.offer as Offer) :
    null;

  if (offer && offer.expiresAtMs > 0 && offer.expiresAtMs <= now) {
    offer = null;
    await db.collection(SESSIONS).doc(orderId).set({
      offer: null,
      status: "expired",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return;
  }

  const restaurantName = str(session.restaurantName, "Restaurant");
  const attempts = Math.max(0, Math.floor(num(session.recoveryAttempts, 0)));

  // Reminder 1
  if (
    config.enableReminderNotifications &&
    reminder1SentAtMs == null &&
    now - createdAtMs >= config.notificationDelay1Minutes * 60 * 1000
  ) {
    let sent = false;
    if (config.enablePushNotifications) {
      const token = await expoTokenFor(userId);
      if (token) {
        sent = await sendExpoPush(
          token,
          config.previewNotificationTitle,
          `Complete your order from ${restaurantName} before it expires.`,
          {
            type: "abandoned_checkout",
            orderId,
            deepLink: `/checkout?orderId=${encodeURIComponent(orderId)}`,
          },
        );
      }
    }
    await db.collection(SESSIONS).doc(orderId).set({
      reminder1SentAt: FieldValue.serverTimestamp(),
      reminder1SentAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    if (sent) await bumpAnalytics({notificationsSent: 1});
  }

  // Reminder 2 + maybe offer
  const r1 = reminder1SentAtMs ?? (now - createdAtMs >= config.notificationDelay1Minutes * 60 * 1000 ? now : null);
  if (
    config.enableReminderNotifications &&
    r1 != null &&
    reminder2SentAtMs == null &&
    now - r1 >= config.notificationDelay2Minutes * 60 * 1000
  ) {
    const stats = await readUserStats(userId);
    if (!offer && canGrantOffer(config, stats, now) && attempts < config.maxRecoveryAttemptsPerOrder) {
      offer = {
        type: config.offerType,
        value: config.offerValue,
        label: offerLabel(config.offerType, config.offerValue),
        expiresAtMs: now + config.offerExpirationMinutes * 60 * 1000,
        appliedToOrder: false,
        redeemed: false,
      };
      await applyOfferToUnpaidOrder(orderId, offer);
      offer = {...offer, appliedToOrder: offer.type !== "reward_points" ? true : false};
      await db.collection(SESSIONS).doc(orderId).set({
        offer,
        recoveryAttempts: attempts + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await db.collection(USER_STATS).doc(userId).set({
        offersReceived: FieldValue.increment(1),
        lastOfferAtMs: now,
        suspiciousAbandonStreak: 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await bumpAnalytics({offersGenerated: 1});
    }

    let sent = false;
    if (config.enablePushNotifications) {
      const token = await expoTokenFor(userId);
      if (token) {
        const title = offer ? config.previewOfferTitle : "Hungry? Complete your order before it expires.";
        const body = offer ?
          config.previewOfferBody :
          `Your order from ${restaurantName} is still unpaid.`;
        sent = await sendExpoPush(token, title, body, {
          type: "abandoned_checkout",
          orderId,
          deepLink: `/checkout?orderId=${encodeURIComponent(orderId)}`,
        });
      }
    }
    await db.collection(SESSIONS).doc(orderId).set({
      reminder2SentAt: FieldValue.serverTimestamp(),
      reminder2SentAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    if (sent) await bumpAnalytics({notificationsSent: 1});
  }
}

async function discoverUnpaidOrders(config: Config, now: number): Promise<void> {
  if (!config.enabled || !config.enableRecoveryAutomation) return;

  const cutoff = Timestamp.fromMillis(now - config.notificationDelay1Minutes * 60 * 1000);
  const snap = await db.collection("orders")
    .where("status", "==", "awaiting_payment")
    .where("paymentStatus", "==", "unpaid")
    .where("createdAt", "<=", cutoff)
    .limit(80)
    .get();

  for (const doc of snap.docs) {
    const order = doc.data() as Record<string, unknown>;
    if (!isUnpaidAwaiting(order)) continue;
    const userId = str(order.userId);
    if (!userId) continue;
    const createdAtMs = tsMs(order.createdAt) ?? now;
    if (await hasNewerPaidOrder(userId, createdAtMs)) continue;

    const sessionRef = db.collection(SESSIONS).doc(doc.id);
    const existing = await sessionRef.get();
    if (existing.exists) continue;

    const restaurantObj = order.restaurant && typeof order.restaurant === "object" ?
      (order.restaurant as Record<string, unknown>) :
      null;

    await sessionRef.set({
      orderId: doc.id,
      userId,
      restaurantId: str(order.restaurantId, str(order.venueId)),
      restaurantName: str(order.restaurantName, str(restaurantObj?.name, "Restaurant")),
      totalPrice: Math.max(0, num(order.totalPrice, num(order.total, 0))),
      itemSummary: summarizeItems(order.items),
      createdAtMs,
      status: "active",
      reminder1SentAtMs: null,
      reminder2SentAtMs: null,
      recoveryAttempts: 0,
      offer: null,
      notificationsOpened: 0,
      countedInAnalytics: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    await db.collection(USER_STATS).doc(userId).set({
      uid: userId,
      abandonmentCount: FieldValue.increment(1),
      lastAbandonmentAtMs: now,
      suspiciousAbandonStreak: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    await bumpAnalytics({abandonedCheckouts: 1});
  }
}

/** Every 5 minutes — discover unpaid checkouts, send reminders, grant offers. */
export const processAbandonedCheckoutRecovery = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "UTC",
    retryCount: 1,
  },
  async () => {
    const config = await loadConfig();
    if (!config.enabled || !config.enableRecoveryAutomation) {
      logger.info("[abandoned-checkout] disabled_skip");
      return;
    }
    const now = Date.now();
    await discoverUnpaidOrders(config, now);

    const active = await db.collection(SESSIONS)
      .where("status", "in", ["active", "expired"])
      .limit(120)
      .get();

    for (const doc of active.docs) {
      try {
        await processSession(doc.id, doc.data() as Record<string, unknown>, config, now);
      } catch (error) {
        logger.warn("[abandoned-checkout] session_failed", {
          orderId: doc.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

/** Apply recovery offer pricing to an unpaid order before opening checkout. */
export const applyAbandonedCheckoutRecoveryOffer = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const uid = request.auth.uid;
  const orderId = str(request.data?.orderId);
  if (!orderId) throw new HttpsError("invalid-argument", "orderId required");

  const config = await loadConfig();
  const sessionSnap = await db.collection(SESSIONS).doc(orderId).get();
  if (!sessionSnap.exists) {
    return {ok: true, orderId};
  }
  const session = sessionSnap.data() as Record<string, unknown>;
  if (str(session.userId) !== uid) {
    throw new HttpsError("permission-denied", "Not your order");
  }

  const orderSnap = await db.collection("orders").doc(orderId).get();
  if (!orderSnap.exists || !isUnpaidAwaiting(orderSnap.data() as Record<string, unknown>)) {
    return {ok: true, orderId};
  }

  let offer = session.offer && typeof session.offer === "object" ?
    (session.offer as Offer) :
    null;
  const now = Date.now();

  if (offer && offer.expiresAtMs <= now) {
    await db.collection(SESSIONS).doc(orderId).set({
      offer: null,
      status: "expired",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {ok: true, orderId};
  }

  if (!offer && config.enableRecoveryOffers) {
    const stats = await readUserStats(uid);
    const attempts = Math.max(0, Math.floor(num(session.recoveryAttempts, 0)));
    if (canGrantOffer(config, stats, now) && attempts < config.maxRecoveryAttemptsPerOrder) {
      offer = {
        type: config.offerType,
        value: config.offerValue,
        label: offerLabel(config.offerType, config.offerValue),
        expiresAtMs: now + config.offerExpirationMinutes * 60 * 1000,
        appliedToOrder: false,
        redeemed: false,
      };
      await db.collection(USER_STATS).doc(uid).set({
        offersReceived: FieldValue.increment(1),
        lastOfferAtMs: now,
        suspiciousAbandonStreak: 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await bumpAnalytics({offersGenerated: 1});
      await db.collection(SESSIONS).doc(orderId).set({
        offer,
        recoveryAttempts: attempts + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  }

  if (offer && !offer.appliedToOrder) {
    await applyOfferToUnpaidOrder(orderId, offer);
    await db.collection(SESSIONS).doc(orderId).set({
      offer: {...offer, appliedToOrder: true},
      status: "active",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }

  return {ok: true, orderId};
});

/** Record a recovery notification open (analytics). */
export const recordAbandonedCheckoutNotificationOpen = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const orderId = str(request.data?.orderId);
  if (!orderId) throw new HttpsError("invalid-argument", "orderId required");
  const sessionSnap = await db.collection(SESSIONS).doc(orderId).get();
  if (!sessionSnap.exists) return {ok: true};
  const session = sessionSnap.data() as Record<string, unknown>;
  if (str(session.userId) !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Not your session");
  }
  await db.collection(SESSIONS).doc(orderId).set({
    notificationsOpened: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  await bumpAnalytics({notificationsOpened: 1});
  return {ok: true};
});
