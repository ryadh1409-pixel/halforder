/**
 * Isolated Cashback Rewards backend.
 *
 * Reward documents and wallet balances are written only with the Admin SDK.
 */
import {
  FieldValue,
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

const SETTINGS_REF = "platformSettings/cashbackRewards";
const TRANSACTIONS = "cashbackTransactions";
const WALLETS = "walletBalances";
const EXPIRATION_BATCH_SIZE = 200;
const ADMIN_ANALYTICS_LIMIT = 1000;

/** Must stay in sync with `isAdminUidAllowlist()` in firestore.rules. */
const ADMIN_UIDS = [
  "KT3LfXRsVgaH4LfRTQaexvj3CRn1",
  "Gjj6x4OU4OQmsnplollo9PLLpxt2",
];
/** Must stay in sync with `isAdminEmailToken()` in firestore.rules. */
const ADMIN_EMAILS = [
  "ryadh1409@gmail.com",
  "admin@ourfood.com",
  "support@halforder.app",
];

type OrderType = "delivery" | "pickup";
type CashbackStatus =
  "pending" | "available" | "reserved" | "redeemed" |
  "cancelled" | "expired";

type CashbackSettings = {
  enabled: boolean;
  visibleInUserApp: boolean;
  paused: boolean;
  cashbackPercentage: number;
  maxCashbackPerOrderCents: number;
  minimumOrderValueCents: number;
  eligibleRestaurantIds: string[];
  eligibleOrderTypes: OrderType[];
  campaignBudgetCents: number;
  startAtMs: number | null;
  endAtMs: number | null;
  expirationDays: number | null;
  totalIssuedCents: number;
  totalRedeemedCents: number;
  pendingCashbackCents: number;
  rewardsCommittedCents: number;
  activeUsers: number;
  cancelledRewards: number;
  expiredRewards: number;
};

const DEFAULTS = {
  enabled: false,
  visibleInUserApp: true,
  paused: false,
  cashbackPercentage: 3,
  maxCashbackPerOrderCad: 100,
  minimumOrderValueCad: 0,
  eligibleRestaurantIds: [] as string[],
  eligibleOrderTypes: ["delivery", "pickup"] as OrderType[],
  campaignBudgetCad: 10000,
  startAtMs: null as number | null,
  endAtMs: null as number | null,
  expirationDays: null as number | null,
};

function finite(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function integer(value: unknown, fallback = 0): number {
  return Math.max(0, Math.round(finite(value, fallback)));
}

function cadToCents(value: unknown, fallbackCad = 0): number {
  return integer(finite(value, fallbackCad) * 100);
}

function centsToCad(value: number): number {
  return Math.round(value) / 100;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): DocumentData {
  return value && typeof value === "object" ?
    value as DocumentData :
    {};
}

function millis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toMillis" in value) {
    try {
      const parsed = (value as {toMillis: () => number}).toMillis();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function nullableDays(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Math.floor(finite(value, Number.NaN));
  return Number.isFinite(parsed) ? Math.max(1, parsed) : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].slice(0, 500);
}

function orderTypes(value: unknown, fallback: OrderType[]): OrderType[] {
  if (!Array.isArray(value)) return fallback;
  const parsed = [...new Set(value.filter(
    (row): row is OrderType => row === "delivery" || row === "pickup",
  ))];
  return parsed.length > 0 ? parsed : fallback;
}

function counterCents(
  data: DocumentData | undefined,
  centsField: string,
  cadField: string,
): number {
  if (data?.[centsField] !== undefined) return integer(data[centsField]);
  return cadToCents(data?.[cadField]);
}

function parseSettings(data: DocumentData | undefined): CashbackSettings {
  return {
    enabled: data?.enabled === true,
    visibleInUserApp: data?.visibleInUserApp !== false,
    paused: data?.paused === true,
    cashbackPercentage: Math.min(
      100,
      Math.max(
        0,
        finite(data?.cashbackPercentage, DEFAULTS.cashbackPercentage),
      ),
    ),
    maxCashbackPerOrderCents: cadToCents(
      data?.maxCashbackPerOrderCad,
      DEFAULTS.maxCashbackPerOrderCad,
    ),
    minimumOrderValueCents: cadToCents(
      data?.minimumOrderValueCad,
      DEFAULTS.minimumOrderValueCad,
    ),
    eligibleRestaurantIds: Array.isArray(data?.eligibleRestaurantIds) ?
      stringList(data?.eligibleRestaurantIds) :
      DEFAULTS.eligibleRestaurantIds,
    eligibleOrderTypes: orderTypes(
      data?.eligibleOrderTypes,
      DEFAULTS.eligibleOrderTypes,
    ),
    campaignBudgetCents: cadToCents(
      data?.campaignBudgetCad,
      DEFAULTS.campaignBudgetCad,
    ),
    startAtMs: millis(data?.startAtMs),
    endAtMs: millis(data?.endAtMs),
    expirationDays: nullableDays(data?.expirationDays),
    totalIssuedCents: counterCents(
      data,
      "totalIssuedCents",
      "totalIssuedCad",
    ),
    totalRedeemedCents: counterCents(
      data,
      "totalRedeemedCents",
      "totalRedeemedCad",
    ),
    pendingCashbackCents: counterCents(
      data,
      "pendingCashbackCents",
      "pendingCashbackCad",
    ),
    rewardsCommittedCents: counterCents(
      data,
      "rewardsCommittedCents",
      "rewardsCommittedCad",
    ),
    activeUsers: integer(data?.activeUsers),
    cancelledRewards: integer(data?.cancelledRewards),
    expiredRewards: integer(data?.expiredRewards),
  };
}

function publicSettings(settings: CashbackSettings): DocumentData {
  return {
    enabled: settings.enabled,
    visibleInUserApp: settings.visibleInUserApp,
    paused: settings.paused,
    cashbackPercentage: settings.cashbackPercentage,
    maxCashbackPerOrderCad: centsToCad(
      settings.maxCashbackPerOrderCents,
    ),
    minimumOrderValueCad: centsToCad(settings.minimumOrderValueCents),
    eligibleRestaurantIds: settings.eligibleRestaurantIds,
    eligibleOrderTypes: settings.eligibleOrderTypes,
    campaignBudgetCad: centsToCad(settings.campaignBudgetCents),
    startAtMs: settings.startAtMs,
    endAtMs: settings.endAtMs,
    expirationDays: settings.expirationDays,
  };
}

function adminSettings(settings: CashbackSettings): DocumentData {
  return {
    ...publicSettings(settings),
    totalIssuedCad: centsToCad(settings.totalIssuedCents),
    totalRedeemedCad: centsToCad(settings.totalRedeemedCents),
    pendingCashbackCad: centsToCad(settings.pendingCashbackCents),
    rewardsCommittedCad: centsToCad(settings.rewardsCommittedCents),
    activeUsers: settings.activeUsers,
    cancelledRewards: settings.cancelledRewards,
    expiredRewards: settings.expiredRewards,
  };
}

function isAdmin(data: DocumentData | undefined): boolean {
  return text(data?.role).toLowerCase() === "admin";
}

/** Mirrors the admin identities accepted by the Driver Referral backend. */
async function requireAdmin(auth: {
  uid: string;
  token?: {email?: unknown};
}): Promise<void> {
  const email = text(auth.token?.email).toLowerCase();
  if (ADMIN_EMAILS.includes(email) || ADMIN_UIDS.includes(auth.uid)) return;

  const db = getFirestore();
  const [userSnap, adminSnap] = await Promise.all([
    db.doc(`users/${auth.uid}`).get(),
    db.doc(`admins/${auth.uid}`).get(),
  ]);
  if (isAdmin(userSnap.data())) return;
  if (adminSnap.exists && adminSnap.data()?.active === true) return;
  throw new HttpsError("permission-denied", "Admin only");
}

async function requireCustomer(uid: string): Promise<void> {
  const snap = await getFirestore().doc(`users/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Customer account required");
  }
  const role = text(snap.data()?.role).toLowerCase();
  if (role !== "user" && role !== "customer") {
    throw new HttpsError("permission-denied", "Customer account required");
  }
}

function firstNumber(data: DocumentData, paths: string[]): number | null {
  for (const path of paths) {
    let value: unknown = data;
    for (const part of path.split(".")) {
      value = object(value)[part];
    }
    if (
      (typeof value === "number" || typeof value === "string") &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }
  return null;
}

function centsField(data: DocumentData, paths: string[]): number | null {
  const value = firstNumber(data, paths);
  return value == null ? null : integer(value);
}

function cadField(data: DocumentData, paths: string[]): number | null {
  const value = firstNumber(data, paths);
  return value == null ? null : cadToCents(value);
}

/**
 * Uses the receipt total before HalfOrder Cash minus the applied amount. Orders
 * that already persist the post-redemption customer total use that directly.
 */
function amountActuallyDueCents(order: DocumentData): number {
  const originalCents =
    centsField(order, [
      "originalTotalCents",
      "originalCustomerTotalCents",
      "totalBeforeCashCents",
      "payment.originalTotalCents",
      "cashback.originalTotalCents",
    ]) ??
    cadField(order, [
      "originalTotal",
      "totalBeforeCash",
      "payment.originalTotal",
      "cashback.originalTotal",
    ]);
  const appliedCents =
    centsField(order, [
      "halfOrderCashAppliedCents",
      "cashbackAppliedCents",
      "walletAppliedCents",
      "creditsAppliedCents",
      "payment.halfOrderCashAppliedCents",
      "cashback.appliedCents",
    ]) ??
    cadField(order, [
      "halfOrderCashAppliedCad",
      "halfOrderCashApplied",
      "cashbackAppliedCad",
      "walletApplied",
      "creditsApplied",
      "payment.halfOrderCashApplied",
      "cashback.appliedCad",
    ]);
  if (originalCents != null && appliedCents != null) {
    return Math.max(0, originalCents - appliedCents);
  }

  const customerTotal =
    centsField(order, ["customerTotalCents", "payment.customerTotalCents"]) ??
    cadField(order, ["customerTotal", "payment.customerTotal"]);
  if (customerTotal != null) return Math.max(0, customerTotal);

  const fallback =
    centsField(order, ["totalCents", "amountCents"]) ??
    cadField(order, ["total", "totalPrice", "amount"]) ??
    0;
  return Math.max(0, fallback - (appliedCents ?? 0));
}

function customerId(order: DocumentData): string {
  return text(order.userId) ||
    text(order.customerId) ||
    text(object(order.customer).id) ||
    text(order.createdBy);
}

function restaurantId(order: DocumentData): string {
  return text(order.restaurantId) ||
    text(order.venueId) ||
    text(object(order.restaurant).id);
}

function restaurantName(order: DocumentData): string {
  return text(order.restaurantName) ||
    text(object(order.restaurant).name) ||
    "Restaurant";
}

function orderType(order: DocumentData): OrderType {
  const value =
    text(order.deliveryType).toLowerCase() ||
    text(order.orderType).toLowerCase() ||
    text(order.fulfillmentType).toLowerCase();
  return value === "pickup" ? "pickup" : "delivery";
}

function isPaid(order: DocumentData | undefined): boolean {
  return ["paid", "succeeded", "completed"].includes(
    text(order?.paymentStatus).toLowerCase(),
  );
}

function isCompleted(order: DocumentData): boolean {
  return ["completed", "delivered"].includes(
    text(order.status).toLowerCase(),
  ) || text(order.deliveryStatus).toLowerCase() === "delivered";
}

function isReversed(order: DocumentData): boolean {
  const reversed = new Set([
    "cancelled",
    "canceled",
    "rejected",
    "refunded",
  ]);
  return reversed.has(text(order.paymentStatus).toLowerCase()) ||
    reversed.has(text(order.status).toLowerCase()) ||
    reversed.has(text(order.deliveryStatus).toLowerCase());
}

function awardEventMs(order: DocumentData, fallback: number): number {
  return millis(order.paidAtMs) ??
    millis(order.paidAt) ??
    millis(order.updatedAtMs) ??
    millis(order.updatedAt) ??
    fallback;
}

function expiresAtMs(settings: CashbackSettings, availableAtMs: number):
  number | null {
  if (settings.expirationDays == null) return null;
  return availableAtMs + settings.expirationDays * 24 * 60 * 60 * 1000;
}

function walletValues(data: DocumentData | undefined): {
  available: number;
  pending: number;
  reserved: number;
  active: boolean;
  latestIds: string[];
} {
  const available = integer(data?.availableCents);
  const pending = integer(data?.pendingCents);
  const reserved = integer(data?.reservedCents);
  return {
    available,
    pending,
    reserved,
    active: data?.isActive === true || available + pending + reserved > 0,
    latestIds: stringList(data?.latestTransactionIds).slice(0, 100),
  };
}

function transactionStatus(data: DocumentData): CashbackStatus {
  const storedStatus = text(data.status);
  const redemptionStatus = text(data.redemptionStatus);
  if (storedStatus === "used" || redemptionStatus === "used") {
    return "redeemed";
  }
  if (
    storedStatus === "released" ||
    storedStatus === "reversed" ||
    redemptionStatus === "released" ||
    redemptionStatus === "reversed"
  ) {
    return "cancelled";
  }
  const allowed: CashbackStatus[] = [
    "pending",
    "available",
    "reserved",
    "redeemed",
    "cancelled",
    "expired",
  ];
  return allowed.includes(storedStatus as CashbackStatus) ?
    storedStatus as CashbackStatus :
    "pending";
}

function serializeTransaction(id: string, data: DocumentData): DocumentData {
  return {
    id,
    type: text(data.type) === "redemption" ? "redemption" : "award",
    status: transactionStatus(data),
    customerId: text(data.customerId) ||
      text(data.uid) ||
      text(data.userId),
    orderId: text(data.orderId) || null,
    restaurantId: text(data.restaurantId) || null,
    restaurantName: text(data.restaurantName) || null,
    orderType: text(data.orderType) || null,
    amountCad: centsToCad(integer(data.amountCents)),
    orderAmountCad: centsToCad(integer(data.orderAmountCents)),
    createdAtMs: millis(data.createdAtMs) ?? millis(data.createdAt),
    availableAtMs: millis(data.availableAtMs),
    expiresAtMs: millis(data.expiresAtMs),
    cancelledAtMs: millis(data.cancelledAtMs),
    expiredAtMs: millis(data.expiredAtMs),
  };
}

function settingsCounterPatch(settings: CashbackSettings): DocumentData {
  return {
    totalIssuedCents: settings.totalIssuedCents,
    totalRedeemedCents: settings.totalRedeemedCents,
    pendingCashbackCents: settings.pendingCashbackCents,
    rewardsCommittedCents: settings.rewardsCommittedCents,
    activeUsers: settings.activeUsers,
    cancelledRewards: settings.cancelledRewards,
    expiredRewards: settings.expiredRewards,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export const getCashbackWallet = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");
  await requireCustomer(uid);

  const db = getFirestore();
  const [settingsSnap, walletSnap] = await Promise.all([
    db.doc(SETTINGS_REF).get(),
    db.doc(`${WALLETS}/${uid}`).get(),
  ]);
  const wallet = walletValues(walletSnap.data());
  const refs = wallet.latestIds.map((id) => db.doc(`${TRANSACTIONS}/${id}`));
  const [awardSnaps, redemptionSnap] = await Promise.all([
    refs.length > 0 ? db.getAll(...refs) : Promise.resolve([]),
    db.collection(TRANSACTIONS).where("uid", "==", uid).limit(100).get(),
  ]);
  const transactionSnaps = [
    ...awardSnaps,
    ...redemptionSnap.docs,
  ].filter((snap, index, rows) =>
    rows.findIndex((row) => row.id === snap.id) === index,
  );
  const transactions = transactionSnaps
    .filter((snap) => snap.exists)
    .map((snap) => serializeTransaction(snap.id, snap.data() ?? {}))
    .filter((row) => row.customerId === uid)
    .sort((a, b) => finite(b.createdAtMs) - finite(a.createdAtMs))
    .slice(0, 100);

  return {
    settings: publicSettings(parseSettings(settingsSnap.data())),
    availableCad: centsToCad(wallet.available),
    pendingCad: centsToCad(wallet.pending),
    reservedCad: centsToCad(wallet.reserved),
    transactions,
  };
});

export const trackCashbackReward = onDocumentWritten(
  {
    document: "orders/{orderId}",
    region: "us-central1",
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;
    const order = afterSnap.data() ?? {};
    const before = event.data?.before?.exists ?
      event.data.before.data() :
      undefined;
    const orderId = event.params.orderId;
    const transactionId = `award_${orderId}`;
    const nowMs = Date.now();

    try {
      await getFirestore().runTransaction(async (tx) => {
        const db = getFirestore();
        const transactionRef = db.doc(`${TRANSACTIONS}/${transactionId}`);
        const settingsRef = db.doc(SETTINGS_REF);
        const [transactionSnap, settingsSnap] = await Promise.all([
          tx.get(transactionRef),
          tx.get(settingsRef),
        ]);
        const existing = transactionSnap.data();

        if (isReversed(order)) {
          if (
            !existing ||
            (existing.status !== "pending" && existing.status !== "available")
          ) {
            return;
          }
          const uid = text(existing.customerId);
          if (!uid) return;
          const walletRef = db.doc(`${WALLETS}/${uid}`);
          const walletSnap = await tx.get(walletRef);
          const wallet = walletValues(walletSnap.data());
          const settings = parseSettings(settingsSnap.data());
          const amount = integer(existing.amountCents);
          const wasPending = existing.status === "pending";
          const nextPending = wasPending ?
            Math.max(0, wallet.pending - amount) :
            wallet.pending;
          const nextAvailable = wasPending ?
            wallet.available :
            Math.max(0, wallet.available - amount);
          const nextActive =
            nextPending + nextAvailable + wallet.reserved > 0;

          tx.set(walletRef, {
            pendingCents: nextPending,
            availableCents: nextAvailable,
            reservedCents: wallet.reserved,
            isActive: nextActive,
            updatedAtMs: nowMs,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          tx.set(transactionRef, {
            status: "cancelled",
            cancellationReason: "order_cancelled_rejected_or_refunded",
            cancelledAtMs: nowMs,
            expiresAtMs: null,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          settings.pendingCashbackCents = wasPending ?
            Math.max(0, settings.pendingCashbackCents - amount) :
            settings.pendingCashbackCents;
          settings.rewardsCommittedCents = Math.max(
            0,
            settings.rewardsCommittedCents - amount,
          );
          settings.cancelledRewards += 1;
          if (wallet.active && !nextActive) {
            settings.activeUsers = Math.max(0, settings.activeUsers - 1);
          }
          tx.set(settingsRef, settingsCounterPatch(settings), {merge: true});
          return;
        }

        if (existing?.status === "pending" && isPaid(order) &&
          isCompleted(order)) {
          const uid = text(existing.customerId);
          if (!uid) return;
          const walletRef = db.doc(`${WALLETS}/${uid}`);
          const walletSnap = await tx.get(walletRef);
          const wallet = walletValues(walletSnap.data());
          const settings = parseSettings(settingsSnap.data());
          const amount = integer(existing.amountCents);
          const availableAt = nowMs;

          tx.set(walletRef, {
            pendingCents: Math.max(0, wallet.pending - amount),
            availableCents: wallet.available + amount,
            reservedCents: wallet.reserved,
            isActive: true,
            updatedAtMs: nowMs,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          tx.set(transactionRef, {
            status: "available",
            availableAtMs: availableAt,
            expiresAtMs: expiresAtMs(settings, availableAt),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          settings.pendingCashbackCents = Math.max(
            0,
            settings.pendingCashbackCents - amount,
          );
          settings.totalIssuedCents += amount;
          tx.set(settingsRef, settingsCounterPatch(settings), {merge: true});
          return;
        }

        const justPaid = isPaid(order) && !isPaid(before);
        if (existing || !justPaid) return;

        const uid = customerId(order);
        const rid = restaurantId(order);
        const kind = orderType(order);
        const settings = parseSettings(settingsSnap.data());
        const eventMs = awardEventMs(order, nowMs);
        const orderAmount = amountActuallyDueCents(order);
        if (
          !uid ||
          !settings.enabled ||
          settings.paused ||
          (settings.startAtMs != null && eventMs < settings.startAtMs) ||
          (settings.endAtMs != null && eventMs > settings.endAtMs) ||
          !settings.eligibleOrderTypes.includes(kind) ||
          (settings.eligibleRestaurantIds.length > 0 &&
            !settings.eligibleRestaurantIds.includes(rid)) ||
          orderAmount < settings.minimumOrderValueCents
        ) {
          return;
        }

        const amount = Math.min(
          settings.maxCashbackPerOrderCents,
          Math.round(orderAmount * settings.cashbackPercentage / 100),
        );
        if (
          amount <= 0 ||
          settings.rewardsCommittedCents + amount >
            settings.campaignBudgetCents
        ) {
          return;
        }

        const walletRef = db.doc(`${WALLETS}/${uid}`);
        const walletSnap = await tx.get(walletRef);
        const wallet = walletValues(walletSnap.data());
        const available = isCompleted(order);
        const availableAt = available ? nowMs : null;
        const latestIds = [
          transactionId,
          ...wallet.latestIds.filter((id) => id !== transactionId),
        ].slice(0, 100);

        tx.create(transactionRef, {
          type: "award",
          status: available ? "available" : "pending",
          customerId: uid,
          uid,
          userId: uid,
          orderId,
          restaurantId: rid || null,
          restaurantName: restaurantName(order),
          orderType: kind,
          amountCents: amount,
          amountCad: centsToCad(amount),
          orderAmountCents: orderAmount,
          createdAtMs: nowMs,
          createdAt: FieldValue.serverTimestamp(),
          availableAtMs: availableAt,
          expiresAtMs: available && availableAt != null ?
            expiresAtMs(settings, availableAt) :
            null,
          campaignSnapshot: publicSettings(settings),
        });
        tx.set(walletRef, {
          customerId: uid,
          availableCents: wallet.available + (available ? amount : 0),
          pendingCents: wallet.pending + (available ? 0 : amount),
          reservedCents: wallet.reserved,
          latestTransactionIds: latestIds,
          isActive: true,
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        settings.rewardsCommittedCents += amount;
        settings.pendingCashbackCents += available ? 0 : amount;
        settings.totalIssuedCents += available ? amount : 0;
        settings.activeUsers += wallet.active ? 0 : 1;
        tx.set(settingsRef, settingsCounterPatch(settings), {merge: true});
      });
    } catch (error) {
      logger.error("trackCashbackReward failed", {
        orderId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export const expireCashbackRewards = onSchedule(
  {
    schedule: "every 24 hours",
    region: "us-central1",
    timeZone: "America/Toronto",
  },
  async () => {
    const db = getFirestore();
    const nowMs = Date.now();
    const expiredSnap = await db.collection(TRANSACTIONS)
      .where("expiresAtMs", "<=", nowMs)
      .limit(EXPIRATION_BATCH_SIZE)
      .get();

    let expired = 0;
    for (const document of expiredSnap.docs) {
      await db.runTransaction(async (tx) => {
        const transactionRef = db.doc(`${TRANSACTIONS}/${document.id}`);
        const settingsRef = db.doc(SETTINGS_REF);
        const [freshSnap, settingsSnap] = await Promise.all([
          tx.get(transactionRef),
          tx.get(settingsRef),
        ]);
        const reward = freshSnap.data();
        if (!reward) return;
        if (reward.status !== "available") {
          tx.set(transactionRef, {
            expiresAtMs: null,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          return;
        }
        if (
          (millis(reward.expiresAtMs) ?? Number.POSITIVE_INFINITY) > nowMs
        ) {
          return;
        }
        const uid = text(reward.customerId);
        if (!uid) return;
        const walletRef = db.doc(`${WALLETS}/${uid}`);
        const walletSnap = await tx.get(walletRef);
        const wallet = walletValues(walletSnap.data());
        const settings = parseSettings(settingsSnap.data());
        const amount = integer(reward.amountCents);
        const nextAvailable = Math.max(0, wallet.available - amount);
        const nextActive = nextAvailable + wallet.pending + wallet.reserved > 0;

        tx.set(walletRef, {
          availableCents: nextAvailable,
          pendingCents: wallet.pending,
          reservedCents: wallet.reserved,
          isActive: nextActive,
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        tx.set(transactionRef, {
          status: "expired",
          expiredAtMs: nowMs,
          expiresAtMs: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        settings.rewardsCommittedCents = Math.max(
          0,
          settings.rewardsCommittedCents - amount,
        );
        settings.expiredRewards += 1;
        if (wallet.active && !nextActive) {
          settings.activeUsers = Math.max(0, settings.activeUsers - 1);
        }
        tx.set(settingsRef, settingsCounterPatch(settings), {merge: true});
        expired += 1;
      });
    }
    logger.info("expireCashbackRewards completed", {
      candidates: expiredSnap.size,
      expired,
    });
  },
);

export const getAdminCashbackRewards = onCall(async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required");
  await requireAdmin(auth);

  const db = getFirestore();
  const [settingsSnap, transactionsSnap] = await Promise.all([
    db.doc(SETTINGS_REF).get(),
    db.collection(TRANSACTIONS).limit(ADMIN_ANALYTICS_LIMIT).get(),
  ]);
  const settings = parseSettings(settingsSnap.data());
  const transactions = transactionsSnap.docs
    .map((doc) => serializeTransaction(doc.id, doc.data()))
    .sort((a, b) => finite(b.createdAtMs) - finite(a.createdAtMs));
  const restaurantTotals = new Map<string, {
    restaurantId: string;
    restaurantName: string;
    cashbackCents: number;
    orders: number;
  }>();
  const dateTotals = new Map<string, {
    issuedCents: number;
    pendingCents: number;
    redeemedCents: number;
  }>();

  for (const doc of transactionsSnap.docs) {
    const row = doc.data();
    const status = transactionStatus(row);
    const type = text(row.type) === "redemption" ? "redemption" : "award";
    if (["cancelled", "expired"].includes(status)) continue;
    const amount = integer(row.amountCents);
    const rid = text(row.restaurantId);
    if (type === "award" && rid) {
      const current = restaurantTotals.get(rid) ?? {
        restaurantId: rid,
        restaurantName: text(row.restaurantName) || "Restaurant",
        cashbackCents: 0,
        orders: 0,
      };
      current.cashbackCents += amount;
      current.orders += 1;
      restaurantTotals.set(rid, current);
    }
    const createdAt = millis(row.createdAtMs) ?? millis(row.createdAt);
    if (createdAt == null) continue;
    const date = new Date(createdAt).toISOString().slice(0, 10);
    const daily = dateTotals.get(date) ?? {
      issuedCents: 0,
      pendingCents: 0,
      redeemedCents: 0,
    };
    if (type === "award" && status === "pending") {
      daily.pendingCents += amount;
    }
    if (
      type === "award" &&
      ["available", "reserved", "redeemed"].includes(status)
    ) {
      daily.issuedCents += amount;
    }
    if (type === "redemption" && status === "redeemed") {
      daily.redeemedCents += amount;
    }
    dateTotals.set(date, daily);
  }

  return {
    settings: adminSettings(settings),
    analytics: {
      totalIssuedCad: centsToCad(settings.totalIssuedCents),
      totalRedeemedCad: centsToCad(settings.totalRedeemedCents),
      totalPendingCad: centsToCad(settings.pendingCashbackCents),
      activeUsers: settings.activeUsers,
      redemptionRate: settings.totalIssuedCents > 0 ?
        settings.totalRedeemedCents / settings.totalIssuedCents :
        0,
      budgetRemainingCad: centsToCad(Math.max(
        0,
        settings.campaignBudgetCents - settings.rewardsCommittedCents,
      )),
    },
    topRestaurants: [...restaurantTotals.values()]
      .sort((a, b) => b.cashbackCents - a.cashbackCents)
      .slice(0, 10)
      .map((row) => ({
        restaurantId: row.restaurantId,
        restaurantName: row.restaurantName,
        cashbackCad: centsToCad(row.cashbackCents),
        orders: row.orders,
      })),
    cashbackByDate: [...dateTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({
        date,
        issuedCad: centsToCad(row.issuedCents),
        pendingCad: centsToCad(row.pendingCents),
        redeemedCad: centsToCad(row.redeemedCents),
      })),
    transactions: transactions.slice(0, 500),
  };
});

export const saveAdminCashbackRewards = onCall(async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required");
  await requireAdmin(auth);
  const input = object(request.data);
  const db = getFirestore();

  await db.runTransaction(async (tx) => {
    const ref = db.doc(SETTINGS_REF);
    const snap = await tx.get(ref);
    const previous = parseSettings(snap.data());
    const startAtMs = input.startAtMs === undefined ?
      previous.startAtMs :
      millis(input.startAtMs);
    const endAtMs = input.endAtMs === undefined ?
      previous.endAtMs :
      millis(input.endAtMs);
    if (startAtMs != null && endAtMs != null && endAtMs <= startAtMs) {
      throw new HttpsError(
        "invalid-argument",
        "Campaign end must be after its start",
      );
    }

    const campaignBudgetCents = input.campaignBudgetCad === undefined ?
      previous.campaignBudgetCents :
      cadToCents(input.campaignBudgetCad, DEFAULTS.campaignBudgetCad);
    if (campaignBudgetCents < previous.rewardsCommittedCents) {
      throw new HttpsError(
        "failed-precondition",
        "Budget cannot be below committed cashback rewards",
      );
    }

    const cashbackPercentage = input.cashbackPercentage === undefined ?
      previous.cashbackPercentage :
      Math.min(100, Math.max(0, finite(input.cashbackPercentage)));
    const maxCashbackPerOrderCents =
      input.maxCashbackPerOrderCad === undefined ?
        previous.maxCashbackPerOrderCents :
        cadToCents(input.maxCashbackPerOrderCad);
    const minimumOrderValueCents =
      input.minimumOrderValueCad === undefined ?
        previous.minimumOrderValueCents :
        cadToCents(input.minimumOrderValueCad);

    tx.set(ref, {
      enabled: input.enabled === undefined ?
        previous.enabled :
        input.enabled === true,
      visibleInUserApp: input.visibleInUserApp === undefined ?
        previous.visibleInUserApp :
        input.visibleInUserApp === true,
      paused: input.paused === undefined ?
        previous.paused :
        input.paused === true,
      cashbackPercentage,
      maxCashbackPerOrderCad: centsToCad(maxCashbackPerOrderCents),
      minimumOrderValueCad: centsToCad(minimumOrderValueCents),
      eligibleRestaurantIds: input.eligibleRestaurantIds === undefined ?
        previous.eligibleRestaurantIds :
        stringList(input.eligibleRestaurantIds),
      eligibleOrderTypes: input.eligibleOrderTypes === undefined ?
        previous.eligibleOrderTypes :
        orderTypes(input.eligibleOrderTypes, DEFAULTS.eligibleOrderTypes),
      campaignBudgetCad: centsToCad(campaignBudgetCents),
      startAtMs,
      endAtMs,
      expirationDays: input.expirationDays === undefined ?
        previous.expirationDays :
        nullableDays(input.expirationDays),
      ...settingsCounterPatch(previous),
      updatedBy: auth.uid,
      updatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  return {ok: true};
});
