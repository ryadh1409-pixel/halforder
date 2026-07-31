/**
 * Driver Referral Program.
 *
 * Isolated from checkout, matching, and driver payout writes. Attribution,
 * reward approval, campaign counters, and payout-ledger entries are server-only.
 */
import {createHash} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

const SETTINGS_REF = "platformSettings/driverReferralCampaign";
const CODES = "driverReferralCodes";
const ATTRIBUTIONS = "driverReferralAttributions";
const REWARDS = "driverReferralRewards";
const DRIVER_STATS = "driverReferralDriverStats";
const IDENTITIES = "driverReferralIdentities";
const NEW_ACCOUNT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

type RewardType = "delivery_fee_percentage" | "fixed_amount";
type RewardStatus = "pending" | "approved" | "paid" | "cancelled";

type CampaignSettings = {
  enabled: boolean;
  visibleInDriverApp: boolean;
  paused: boolean;
  rewardType: RewardType;
  rewardPercentage: number;
  fixedRewardCad: number;
  campaignBudgetCad: number;
  startAtMs: number | null;
  endAtMs: number | null;
  maxReferralsPerDriver: number;
  minimumOrderValueCad: number;
  requireCompletedPayment: boolean;
  requireCompletedDelivery: boolean;
  totalReferrals: number;
  acquiredCustomers: number;
  rewardsPaidCad: number;
  rewardsCommittedCad: number;
  approvedRewards: number;
  paidRewards: number;
  cancelledRewards: number;
};

const DEFAULTS = {
  enabled: false,
  visibleInDriverApp: false,
  paused: false,
  rewardType: "delivery_fee_percentage" as RewardType,
  rewardPercentage: 100,
  fixedRewardCad: 5,
  campaignBudgetCad: 1000,
  startAtMs: null as number | null,
  endAtMs: null as number | null,
  maxReferralsPerDriver: 100,
  minimumOrderValueCad: 0,
  requireCompletedPayment: true,
  requireCompletedDelivery: true,
};

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ?
    value :
    fallback;
}

function nullableFinite(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSettings(data: DocumentData | undefined): CampaignSettings {
  const rewardType: RewardType =
    data?.rewardType === "fixed_amount" ?
      "fixed_amount" :
      "delivery_fee_percentage";
  return {
    enabled: data?.enabled === true,
    visibleInDriverApp: data?.visibleInDriverApp === true,
    paused: data?.paused === true,
    rewardType,
    rewardPercentage: Math.min(
      100,
      Math.max(0, finite(data?.rewardPercentage, DEFAULTS.rewardPercentage)),
    ),
    fixedRewardCad: Math.max(
      0,
      finite(data?.fixedRewardCad, DEFAULTS.fixedRewardCad),
    ),
    campaignBudgetCad: Math.max(
      0,
      finite(data?.campaignBudgetCad, DEFAULTS.campaignBudgetCad),
    ),
    startAtMs: nullableFinite(data?.startAtMs),
    endAtMs: nullableFinite(data?.endAtMs),
    maxReferralsPerDriver: Math.max(
      1,
      Math.floor(finite(
        data?.maxReferralsPerDriver,
        DEFAULTS.maxReferralsPerDriver,
      )),
    ),
    minimumOrderValueCad: Math.max(
      0,
      finite(data?.minimumOrderValueCad, DEFAULTS.minimumOrderValueCad),
    ),
    requireCompletedPayment: data?.requireCompletedPayment !== false,
    requireCompletedDelivery: data?.requireCompletedDelivery !== false,
    totalReferrals: Math.max(0, Math.floor(finite(data?.totalReferrals))),
    acquiredCustomers: Math.max(
      0,
      Math.floor(finite(data?.acquiredCustomers)),
    ),
    rewardsPaidCad: Math.max(0, finite(data?.rewardsPaidCad)),
    rewardsCommittedCad: Math.max(0, finite(data?.rewardsCommittedCad)),
    approvedRewards: Math.max(0, Math.floor(finite(data?.approvedRewards))),
    paidRewards: Math.max(0, Math.floor(finite(data?.paidRewards))),
    cancelledRewards: Math.max(
      0,
      Math.floor(finite(data?.cancelledRewards)),
    ),
  };
}

function campaignAcceptsNewReferral(
  settings: CampaignSettings,
  nowMs: number,
): boolean {
  if (!settings.enabled || settings.paused) return false;
  if (settings.startAtMs != null && nowMs < settings.startAtMs) return false;
  if (settings.endAtMs != null && nowMs > settings.endAtMs) return false;
  return true;
}

function campaignCanApprove(
  settings: CampaignSettings,
  attributedAtMs: number,
  nowMs: number,
): boolean {
  if (!settings.enabled) return false;
  if (settings.startAtMs != null && attributedAtMs < settings.startAtMs) {
    return false;
  }
  if (settings.endAtMs != null && nowMs > settings.endAtMs) return false;
  return true;
}

function isAdmin(data: DocumentData | undefined): boolean {
  return text(data?.role).toLowerCase() === "admin";
}

/** Mirrors the four admin identities accepted by `isAdmin()` in firestore.rules. */
async function requireAdmin(auth: {
  uid: string;
  token?: {email?: unknown};
}): Promise<void> {
  const email = text(auth.token?.email).toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return;
  if (ADMIN_UIDS.includes(auth.uid)) return;

  const db = getFirestore();
  const [userSnap, adminSnap] = await Promise.all([
    db.doc(`users/${auth.uid}`).get(),
    db.doc(`admins/${auth.uid}`).get(),
  ]);
  if (isAdmin(userSnap.data())) return;
  if (adminSnap.exists && adminSnap.data()?.active === true) return;

  throw new HttpsError("permission-denied", "Admin only");
}

function codeForDriver(uid: string): string {
  const suffix = createHash("sha256")
    .update(`halforder-driver-referral:${uid}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `DRV${suffix}`;
}

function identityHashes(input: {
  email?: string | null;
  phoneNumber?: string | null;
}): string[] {
  const normalized = [
    input.email ? `email:${input.email.trim().toLowerCase()}` : "",
    input.phoneNumber ? `phone:${input.phoneNumber.replace(/\D/g, "")}` : "",
  ].filter(Boolean);
  return normalized.map((value) =>
    createHash("sha256").update(value).digest("hex"),
  );
}

function millis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    try {
      return (value as {toMillis: () => number}).toMillis();
    } catch {
      return null;
    }
  }
  return null;
}

function rewardAmount(settings: CampaignSettings, order: DocumentData): number {
  if (settings.rewardType === "fixed_amount") {
    return Math.round(settings.fixedRewardCad * 100) / 100;
  }
  const deliveryFee = Math.max(
    0,
    finite(order.deliveryFee, finite(order.fees?.deliveryFee)),
  );
  return Math.round(deliveryFee * settings.rewardPercentage) / 100;
}

function orderTotal(order: DocumentData): number {
  return Math.max(
    0,
    finite(
      order.customerTotal,
      finite(order.totalPrice, finite(order.total, finite(order.amount))),
    ),
  );
}

function orderEligible(
  settings: CampaignSettings,
  order: DocumentData,
): boolean {
  const status = text(order.status).toLowerCase();
  const deliveryStatus = text(order.deliveryStatus).toLowerCase();
  const paymentStatus = text(order.paymentStatus).toLowerCase();
  const updatedBy = text(order.updatedBy);
  const completed =
    status === "completed" ||
    status === "delivered" ||
    deliveryStatus === "delivered";
  if (!completed || order.earningsRecorded !== true) return false;
  if (updatedBy.startsWith("repairStale")) return false;
  if (
    settings.requireCompletedPayment &&
    paymentStatus !== "paid" &&
    paymentStatus !== "succeeded" &&
    paymentStatus !== "completed"
  ) {
    return false;
  }
  if (
    settings.requireCompletedDelivery &&
    deliveryStatus !== "delivered"
  ) {
    return false;
  }
  return orderTotal(order) >= settings.minimumOrderValueCad;
}

function orderJustBecameEligible(
  before: DocumentData | undefined,
  after: DocumentData,
): boolean {
  const beforeRecorded = before?.earningsRecorded === true;
  const afterRecorded = after.earningsRecorded === true;
  const beforePaid = ["paid", "succeeded", "completed"].includes(
    text(before?.paymentStatus).toLowerCase(),
  );
  const afterPaid = ["paid", "succeeded", "completed"].includes(
    text(after.paymentStatus).toLowerCase(),
  );
  return (afterRecorded && !beforeRecorded) || (afterPaid && !beforePaid);
}

function customerIds(order: DocumentData): string[] {
  return [...new Set([
    text(order.userId),
    text(order.customerId),
    text(order.createdBy),
  ].filter(Boolean))];
}

function publicSettings(settings: CampaignSettings): DocumentData {
  return {
    enabled: settings.enabled,
    visibleInDriverApp: settings.visibleInDriverApp,
    paused: settings.paused,
    rewardType: settings.rewardType,
    rewardPercentage: settings.rewardPercentage,
    fixedRewardCad: settings.fixedRewardCad,
    startAtMs: settings.startAtMs,
    endAtMs: settings.endAtMs,
  };
}

function serializeReward(
  id: string,
  data: DocumentData,
): DocumentData {
  return {
    id,
    customerName: text(data.customerName) || "New customer",
    customerId: text(data.customerId),
    driverId: text(data.driverId),
    orderId: text(data.orderId) || null,
    orderDateMs: millis(data.orderDateMs) ?? millis(data.orderDate),
    rewardAmountCad: Math.max(0, finite(data.rewardAmountCad)),
    status: (["pending", "approved", "paid", "cancelled"].includes(
      text(data.status),
    ) ? text(data.status) : "pending") as RewardStatus,
  };
}

export const getDriverReferralDashboard = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");

  const db = getFirestore();
  const [driverSnap, userSnap, settingsSnap] = await Promise.all([
    db.doc(`drivers/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(SETTINGS_REF).get(),
  ]);
  logger.info("[driverReferral] dashboard gate", {
    uid,
    driverDocExists: driverSnap.exists,
    userRole: text(userSnap.data()?.role) || null,
    settingsDocExists: settingsSnap.exists,
    settingsEnabled: settingsSnap.data()?.enabled ?? null,
    settingsVisibleInDriverApp: settingsSnap.data()?.visibleInDriverApp ?? null,
  });
  if (!driverSnap.exists || text(userSnap.data()?.role) !== "driver") {
    throw new HttpsError("permission-denied", "Driver account required");
  }

  const code = codeForDriver(uid);
  const driverName =
    text(driverSnap.data()?.name) ||
    text(userSnap.data()?.displayName) ||
    text(userSnap.data()?.name) ||
    "Driver";
  await db.runTransaction(async (tx) => {
    const codeRef = db.doc(`${CODES}/${code}`);
    const statsRef = db.doc(`${DRIVER_STATS}/${uid}`);
    const [codeSnap, statsSnap] = await Promise.all([
      tx.get(codeRef),
      tx.get(statsRef),
    ]);
    if (codeSnap.exists && text(codeSnap.data()?.driverId) !== uid) {
      throw new HttpsError("already-exists", "Referral code collision");
    }
    if (!codeSnap.exists) {
      tx.create(codeRef, {
        code,
        driverId: uid,
        driverName,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (!statsSnap.exists) {
      tx.create(statsRef, {
        driverId: uid,
        driverName,
        totalReferrals: 0,
        successfulReferrals: 0,
        pendingRewards: 0,
        approvedRewardsCad: 0,
        paidRewardsCad: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  const [statsSnap, rewardsSnap] = await Promise.all([
    db.doc(`${DRIVER_STATS}/${uid}`).get(),
    db.collection(REWARDS)
      .where("driverId", "==", uid)
      .limit(100)
      .get(),
  ]);
  const stats = statsSnap.data() ?? {};
  const history = rewardsSnap.docs
    .map((doc) => serializeReward(doc.id, doc.data()))
    .sort((a, b) => finite(b.orderDateMs) - finite(a.orderDateMs));
  const settings = parseSettings(settingsSnap.data());

  return {
    code,
    inviteLink: "https://apps.apple.com/ca/app/halforder/id6760587041",
    campaign: publicSettings(settings),
    stats: {
      successfulReferrals: Math.max(
        0,
        Math.floor(finite(stats.successfulReferrals)),
      ),
      pendingRewards: Math.max(
        0,
        Math.floor(finite(stats.pendingRewards)),
      ),
      totalReferralRewardsCad:
        Math.max(0, finite(stats.approvedRewardsCad)) +
        Math.max(0, finite(stats.paidRewardsCad)),
    },
    history,
  };
});

export const attachDriverReferral = onCall(async (request) => {
  const customerId = request.auth?.uid;
  if (!customerId) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const code = text(request.data?.code).toUpperCase();
  if (!/^DRV[A-F0-9]{10}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Invalid referral code");
  }

  const db = getFirestore();
  const [customerAuth, codeSnap, customerSnap, priorOrders] =
    await Promise.all([
      getAuth().getUser(customerId),
      db.doc(`${CODES}/${code}`).get(),
      db.doc(`users/${customerId}`).get(),
      db.collection("orders").where("userId", "==", customerId).limit(10).get(),
    ]);
  if (!codeSnap.exists) {
    throw new HttpsError("not-found", "Referral code not found");
  }
  const driverId = text(codeSnap.data()?.driverId);
  if (!driverId || driverId === customerId) {
    throw new HttpsError("failed-precondition", "Self referrals are not allowed");
  }
  if (text(customerSnap.data()?.role) === "driver") {
    throw new HttpsError(
      "failed-precondition",
      "Driver referrals are for new customers only",
    );
  }
  if (!customerAuth.email && !customerAuth.phoneNumber) {
    throw new HttpsError(
      "failed-precondition",
      "Complete account registration before applying this referral",
    );
  }

  const nowMs = Date.now();
  const createdAtMs = Date.parse(customerAuth.metadata.creationTime);
  if (
    !Number.isFinite(createdAtMs) ||
    nowMs - createdAtMs > NEW_ACCOUNT_MAX_AGE_MS
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Referral is only available to new customers",
    );
  }
  if (priorOrders.docs.some((doc) =>
    ["completed", "delivered"].includes(
      text(doc.data().status).toLowerCase(),
    ),
  )) {
    throw new HttpsError(
      "failed-precondition",
      "Existing customers are not eligible",
    );
  }

  const driverAuth = await getAuth().getUser(driverId);
  const customerIdentities = identityHashes(customerAuth);
  const driverIdentities = new Set(identityHashes(driverAuth));
  if (customerIdentities.some((hash) => driverIdentities.has(hash))) {
    throw new HttpsError("failed-precondition", "Self referrals are not allowed");
  }
  if (customerIdentities.length === 0) {
    throw new HttpsError("failed-precondition", "Verified account required");
  }

  const customerName =
    customerAuth.displayName ||
    text(customerSnap.data()?.displayName) ||
    text(customerSnap.data()?.name) ||
    "New customer";
  const driverName = text(codeSnap.data()?.driverName) || "Driver";

  await db.runTransaction(async (tx) => {
    const attributionRef = db.doc(`${ATTRIBUTIONS}/${customerId}`);
    const rewardRef = db.doc(`${REWARDS}/${customerId}`);
    const statsRef = db.doc(`${DRIVER_STATS}/${driverId}`);
    const settingsRef = db.doc(SETTINGS_REF);
    const identityRefs = customerIdentities.map((hash) =>
      db.doc(`${IDENTITIES}/${hash}`),
    );
    const [
      attributionSnap,
      rewardSnap,
      statsSnap,
      freshSettingsSnap,
      ...identitySnaps
    ] = await Promise.all([
      tx.get(attributionRef),
      tx.get(rewardRef),
      tx.get(statsRef),
      tx.get(settingsRef),
      ...identityRefs.map((ref) => tx.get(ref)),
    ]);

    if (attributionSnap.exists || rewardSnap.exists) {
      const existingDriver =
        text(attributionSnap.data()?.driverId) ||
        text(rewardSnap.data()?.driverId);
      if (existingDriver === driverId) return;
      throw new HttpsError(
        "already-exists",
        "A referral is already attached to this account",
      );
    }
    const settings = parseSettings(freshSettingsSnap.data());
    if (!campaignAcceptsNewReferral(settings, nowMs)) {
      throw new HttpsError(
        "failed-precondition",
        "Referral campaign is not accepting new customers",
      );
    }
    for (const identitySnap of identitySnaps) {
      if (
        identitySnap.exists &&
        text(identitySnap.data()?.customerId) !== customerId
      ) {
        throw new HttpsError(
          "already-exists",
          "This customer identity has already used a referral",
        );
      }
    }

    tx.create(attributionRef, {
      customerId,
      customerName,
      customerEmail: customerAuth.email ?? null,
      driverId,
      driverName,
      code,
      attributedAtMs: nowMs,
      attributedAt: FieldValue.serverTimestamp(),
      authCreatedAtMs: createdAtMs,
      status: "pending",
    });
    tx.create(rewardRef, {
      customerId,
      customerName,
      driverId,
      driverName,
      code,
      status: "pending",
      rewardAmountCad: 0,
      orderId: null,
      orderDateMs: null,
      attributedAtMs: nowMs,
      createdAt: FieldValue.serverTimestamp(),
      campaignSnapshot: publicSettings(settings),
    });
    identityRefs.forEach((ref) => {
      tx.create(ref, {
        customerId,
        driverId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    tx.set(
      statsRef,
      {
        driverId,
        driverName,
        totalReferrals: Math.max(
          0,
          Math.floor(finite(statsSnap.data()?.totalReferrals)),
        ) + 1,
        pendingRewards: Math.max(
          0,
          Math.floor(finite(statsSnap.data()?.pendingRewards)),
        ) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      settingsRef,
      {
        totalReferrals: settings.totalReferrals + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });

  return {ok: true};
});

export const trackDriverReferralReward = onDocumentWritten(
  {
    document: "orders/{orderId}",
    region: "us-central1",
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;
    const before = event.data?.before?.exists ?
      event.data.before.data() :
      undefined;
    const order = afterSnap.data() ?? {};
    if (!orderJustBecameEligible(before, order)) return;

    const db = getFirestore();
    const ids = customerIds(order);
    if (ids.length === 0) return;
    const rewardSnaps = await Promise.all(
      ids.map((id) => db.doc(`${REWARDS}/${id}`).get()),
    );
    const rewardSnap = rewardSnaps.find((snap) => snap.exists);
    if (!rewardSnap || rewardSnap.data()?.status !== "pending") return;
    const customerId = rewardSnap.id;
    const orderId = event.params.orderId;

    try {
      await db.runTransaction(async (tx) => {
        const rewardRef = db.doc(`${REWARDS}/${customerId}`);
        const attributionRef = db.doc(`${ATTRIBUTIONS}/${customerId}`);
        const settingsRef = db.doc(SETTINGS_REF);
        const [freshReward, attributionSnap, settingsSnap] = await Promise.all([
          tx.get(rewardRef),
          tx.get(attributionRef),
          tx.get(settingsRef),
        ]);
        if (!freshReward.exists || freshReward.data()?.status !== "pending") {
          return;
        }
        if (!attributionSnap.exists) return;

        const settings = parseSettings(settingsSnap.data());
        const attribution = attributionSnap.data() ?? {};
        const driverId = text(attribution.driverId);
        const attributedAtMs = finite(attribution.attributedAtMs);
        const nowMs = Date.now();
        const statsRef = db.doc(`${DRIVER_STATS}/${driverId}`);
        const statsSnap = await tx.get(statsRef);
        const stats = statsSnap.data() ?? {};
        const successfulReferrals = Math.max(
          0,
          Math.floor(finite(stats.successfulReferrals)),
        );

        if (
          !driverId ||
          !campaignCanApprove(settings, attributedAtMs, nowMs) ||
          !orderEligible(settings, order)
        ) {
          return;
        }
        if (successfulReferrals >= settings.maxReferralsPerDriver) {
          tx.set(rewardRef, {
            status: "cancelled",
            cancelledReason: "driver_referral_limit_reached",
            orderId,
            orderDateMs: nowMs,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          tx.set(attributionRef, {
            status: "cancelled",
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          tx.set(statsRef, {
            pendingRewards: Math.max(
              0,
              Math.floor(finite(stats.pendingRewards)) - 1,
            ),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          tx.set(settingsRef, {
            cancelledRewards: settings.cancelledRewards + 1,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          return;
        }

        const amount = rewardAmount(settings, order);
        const nextCommitted = settings.rewardsCommittedCad + amount;
        if (amount <= 0 || nextCommitted > settings.campaignBudgetCad) {
          tx.set(rewardRef, {
            status: "cancelled",
            cancelledReason:
              amount <= 0 ? "no_delivery_fee" : "campaign_budget_exhausted",
            orderId,
            orderDateMs: nowMs,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          tx.set(attributionRef, {
            status: "cancelled",
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          tx.set(statsRef, {
            pendingRewards: Math.max(
              0,
              Math.floor(finite(stats.pendingRewards)) - 1,
            ),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          tx.set(settingsRef, {
            cancelledRewards: settings.cancelledRewards + 1,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          return;
        }

        const customerName =
          text(order.customerName) ||
          text(attribution.customerName) ||
          "New customer";
        tx.set(rewardRef, {
          status: "approved",
          customerName,
          orderId,
          orderDateMs: nowMs,
          orderDate: FieldValue.serverTimestamp(),
          rewardAmountCad: amount,
          approvedAtMs: nowMs,
          approvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        tx.set(attributionRef, {
          status: "approved",
          firstSuccessfulOrderId: orderId,
          convertedAtMs: nowMs,
          convertedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        tx.set(statsRef, {
          successfulReferrals: successfulReferrals + 1,
          pendingRewards: Math.max(
            0,
            Math.floor(finite(stats.pendingRewards)) - 1,
          ),
          approvedRewardsCad:
            Math.max(0, finite(stats.approvedRewardsCad)) + amount,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        tx.set(settingsRef, {
          acquiredCustomers: settings.acquiredCustomers + 1,
          approvedRewards: settings.approvedRewards + 1,
          rewardsCommittedCad: nextCommitted,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      });
    } catch (error) {
      logger.error("trackDriverReferralReward failed", {
        orderId,
        customerId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export const getAdminDriverReferralCampaign = onCall(async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required");
  await requireAdmin(auth);

  const db = getFirestore();
  const [settingsSnap, rewardsSnap, topDriversSnap] = await Promise.all([
    db.doc(SETTINGS_REF).get(),
    db.collection(REWARDS).limit(250).get(),
    db.collection(DRIVER_STATS)
      .orderBy("successfulReferrals", "desc")
      .limit(10)
      .get(),
  ]);
  const settings = parseSettings(settingsSnap.data());
  const rewards = rewardsSnap.docs
    .map((doc) => serializeReward(doc.id, doc.data()))
    .sort((a, b) => finite(b.orderDateMs) - finite(a.orderDateMs));
  const topDrivers = topDriversSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      driverId: doc.id,
      driverName: text(data.driverName) || "Driver",
      totalReferrals: Math.max(
        0,
        Math.floor(finite(data.totalReferrals)),
      ),
      successfulReferrals: Math.max(
        0,
        Math.floor(finite(data.successfulReferrals)),
      ),
      rewardsCad:
        Math.max(0, finite(data.approvedRewardsCad)) +
        Math.max(0, finite(data.paidRewardsCad)),
    };
  });
  return {
    settings,
    analytics: {
      totalReferrals: settings.totalReferrals,
      newCustomersAcquired: settings.acquiredCustomers,
      conversionRate: settings.totalReferrals > 0 ?
        settings.acquiredCustomers / settings.totalReferrals :
        0,
      rewardsPaidCad: settings.rewardsPaidCad,
      pendingRewards: rewards.filter((row) =>
        row.status === "pending" || row.status === "approved",
      ).length,
      budgetRemainingCad: Math.max(
        0,
        settings.campaignBudgetCad - settings.rewardsCommittedCad,
      ),
    },
    topDrivers,
    rewards,
  };
});

export const saveAdminDriverReferralCampaign = onCall(async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required");
  await requireAdmin(auth);
  const uid = auth.uid;

  const input = request.data ?? {};
  const rewardType: RewardType =
    input.rewardType === "fixed_amount" ?
      "fixed_amount" :
      "delivery_fee_percentage";
  const startAtMs = nullableFinite(input.startAtMs);
  const endAtMs = nullableFinite(input.endAtMs);
  if (startAtMs != null && endAtMs != null && endAtMs <= startAtMs) {
    throw new HttpsError(
      "invalid-argument",
      "Campaign end must be after its start",
    );
  }

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const ref = db.doc(SETTINGS_REF);
    const snap = await tx.get(ref);
    const previous = parseSettings(snap.data());
    const campaignBudgetCad = Math.max(
      0,
      finite(input.campaignBudgetCad, DEFAULTS.campaignBudgetCad),
    );
    if (campaignBudgetCad < previous.rewardsCommittedCad) {
      throw new HttpsError(
        "failed-precondition",
        "Budget cannot be below already approved rewards",
      );
    }
    tx.set(ref, {
      enabled: input.enabled === true,
      visibleInDriverApp: input.visibleInDriverApp === true,
      paused: input.paused === true,
      rewardType,
      rewardPercentage: Math.min(
        100,
        Math.max(0, finite(input.rewardPercentage, 100)),
      ),
      fixedRewardCad: Math.max(0, finite(input.fixedRewardCad, 5)),
      campaignBudgetCad,
      startAtMs,
      endAtMs,
      maxReferralsPerDriver: Math.max(
        1,
        Math.floor(finite(input.maxReferralsPerDriver, 100)),
      ),
      minimumOrderValueCad: Math.max(
        0,
        finite(input.minimumOrderValueCad),
      ),
      requireCompletedPayment: input.requireCompletedPayment !== false,
      requireCompletedDelivery: input.requireCompletedDelivery !== false,
      totalReferrals: previous.totalReferrals,
      acquiredCustomers: previous.acquiredCustomers,
      rewardsPaidCad: previous.rewardsPaidCad,
      rewardsCommittedCad: previous.rewardsCommittedCad,
      approvedRewards: previous.approvedRewards,
      paidRewards: previous.paidRewards,
      cancelledRewards: previous.cancelledRewards,
      updatedBy: uid,
      updatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  return {ok: true};
});

export const updateDriverReferralRewardStatus = onCall(async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required");
  await requireAdmin(auth);
  const uid = auth.uid;
  const customerId = text(request.data?.customerId);
  const action = text(request.data?.action);
  if (!customerId || !["paid", "cancelled"].includes(action)) {
    throw new HttpsError("invalid-argument", "Invalid reward action");
  }

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const rewardRef = db.doc(`${REWARDS}/${customerId}`);
    const attributionRef = db.doc(`${ATTRIBUTIONS}/${customerId}`);
    const settingsRef = db.doc(SETTINGS_REF);
    const [rewardSnap, settingsSnap] = await Promise.all([
      tx.get(rewardRef),
      tx.get(settingsRef),
    ]);
    if (!rewardSnap.exists) {
      throw new HttpsError("not-found", "Reward not found");
    }
    const reward = rewardSnap.data() ?? {};
    const current = text(reward.status) as RewardStatus;
    const driverId = text(reward.driverId);
    const amount = Math.max(0, finite(reward.rewardAmountCad));
    const statsRef = db.doc(`${DRIVER_STATS}/${driverId}`);
    const statsSnap = await tx.get(statsRef);
    const stats = statsSnap.data() ?? {};
    const settings = parseSettings(settingsSnap.data());
    if (current === action) return;

    if (action === "paid") {
      if (current !== "approved") {
        throw new HttpsError(
          "failed-precondition",
          "Only approved rewards can be paid",
        );
      }
      tx.set(rewardRef, {
        status: "paid",
        paidAtMs: Date.now(),
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(attributionRef, {
        status: "paid",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(statsRef, {
        approvedRewardsCad: Math.max(
          0,
          finite(stats.approvedRewardsCad) - amount,
        ),
        paidRewardsCad: Math.max(0, finite(stats.paidRewardsCad)) + amount,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(settingsRef, {
        approvedRewards: Math.max(0, settings.approvedRewards - 1),
        paidRewards: settings.paidRewards + 1,
        rewardsPaidCad: settings.rewardsPaidCad + amount,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.create(db.collection("balanceLedger").doc(), {
        userId: driverId,
        type: "driver_referral_reward",
        amount,
        currency: "CAD",
        status: "paid",
        customerId,
        orderId: text(reward.orderId) || null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
        note: "Driver Referral Program reward",
      });
      return;
    }

    if (current === "paid" || current === "cancelled") {
      throw new HttpsError(
        "failed-precondition",
        "This reward cannot be cancelled",
      );
    }
    tx.set(rewardRef, {
      status: "cancelled",
      cancelledReason: "admin_cancelled",
      cancelledAtMs: Date.now(),
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(attributionRef, {
      status: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(statsRef, {
      pendingRewards:
        current === "pending" ?
          Math.max(0, Math.floor(finite(stats.pendingRewards)) - 1) :
          Math.max(0, Math.floor(finite(stats.pendingRewards))),
      approvedRewardsCad:
        current === "approved" ?
          Math.max(0, finite(stats.approvedRewardsCad) - amount) :
          Math.max(0, finite(stats.approvedRewardsCad)),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(settingsRef, {
      cancelledRewards: settings.cancelledRewards + 1,
      approvedRewards:
        current === "approved" ?
          Math.max(0, settings.approvedRewards - 1) :
          settings.approvedRewards,
      rewardsCommittedCad:
        current === "approved" ?
          Math.max(0, settings.rewardsCommittedCad - amount) :
          settings.rewardsCommittedCad,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  return {ok: true};
});
