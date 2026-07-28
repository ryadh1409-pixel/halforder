/**
 * Limited Driver Launch Campaign — atomic enrollment + delivery progress.
 * Additive only: does not alter marketplace payout, matching, or claim flows.
 */
import {
  FieldValue,
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

const SETTINGS_DOC = "platformSettings/driverLaunchCampaign";
const ENROLLMENTS = "driverLaunchEnrollments";
const PROGRESS = "driverLaunchProgress";

const DEFAULTS = {
  enabled: false,
  paused: false,
  bonusAmountCad: 75,
  requiredDeliveries: 5,
  eligibleDriverLimit: 50,
  startAtMs: null as number | null,
  endAtMs: null as number | null,
  newDriversOnly: false,
  minDriverRating: null as number | null,
  maxCancellationRate: null as number | null,
};

type CampaignSettings = {
  enabled: boolean;
  paused: boolean;
  bonusAmountCad: number;
  requiredDeliveries: number;
  eligibleDriverLimit: number;
  startAtMs: number | null;
  endAtMs: number | null;
  newDriversOnly: boolean;
  minDriverRating: number | null;
  maxCancellationRate: number | null;
  enrolledCount: number;
  driversCompleted: number;
  bonusesPaid: number;
  totalBudgetPaidCad: number;
  progressSum: number;
};

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function parseSettings(data: DocumentData | undefined): CampaignSettings {
  const d = DEFAULTS;
  return {
    enabled: data?.enabled === true,
    paused: data?.paused === true,
    bonusAmountCad: Math.max(0, asNumber(data?.bonusAmountCad, d.bonusAmountCad)),
    requiredDeliveries: Math.max(
      1,
      Math.floor(asNumber(data?.requiredDeliveries, d.requiredDeliveries)),
    ),
    eligibleDriverLimit: Math.max(
      1,
      Math.floor(asNumber(data?.eligibleDriverLimit, d.eligibleDriverLimit)),
    ),
    startAtMs: asNullableNumber(data?.startAtMs),
    endAtMs: asNullableNumber(data?.endAtMs),
    newDriversOnly: data?.newDriversOnly === true,
    minDriverRating: asNullableNumber(data?.minDriverRating),
    maxCancellationRate: asNullableNumber(data?.maxCancellationRate),
    enrolledCount: Math.max(0, Math.floor(asNumber(data?.enrolledCount, 0))),
    driversCompleted: Math.max(0, Math.floor(asNumber(data?.driversCompleted, 0))),
    bonusesPaid: Math.max(0, Math.floor(asNumber(data?.bonusesPaid, 0))),
    totalBudgetPaidCad: Math.max(0, asNumber(data?.totalBudgetPaidCad, 0)),
    progressSum: Math.max(0, asNumber(data?.progressSum, 0)),
  };
}

function windowOpen(s: CampaignSettings, nowMs: number): boolean {
  if (!s.enabled) return false;
  if (s.startAtMs != null && nowMs < s.startAtMs) return false;
  if (s.endAtMs != null && nowMs > s.endAtMs) return false;
  return true;
}

function canEnroll(s: CampaignSettings, nowMs: number): boolean {
  if (!windowOpen(s, nowMs)) return false;
  if (s.paused) return false;
  if (s.enrolledCount >= s.eligibleDriverLimit) return false;
  return true;
}

function canProgress(s: CampaignSettings, nowMs: number): boolean {
  if (!s.enabled) return false;
  if (s.endAtMs != null && nowMs > s.endAtMs) return false;
  return true;
}

function millisFromUnknown(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "toMillis" in v) {
    try {
      return (v as {toMillis: () => number}).toMillis();
    } catch {
      return null;
    }
  }
  return null;
}

function isAdminRole(role: unknown): boolean {
  return typeof role === "string" && role.trim().toLowerCase() === "admin";
}

function orderBecameCompleted(
  before: DocumentData | undefined,
  after: DocumentData,
): boolean {
  const afterRecorded = after.earningsRecorded === true;
  const beforeRecorded = before?.earningsRecorded === true;
  if (afterRecorded && !beforeRecorded) return true;

  const afterStatus = String(after.status ?? "").toLowerCase();
  const afterDelivery = String(after.deliveryStatus ?? "").toLowerCase();
  const beforeStatus = String(before?.status ?? "").toLowerCase();
  const beforeDelivery = String(before?.deliveryStatus ?? "").toLowerCase();

  const afterDone =
    afterStatus.includes("complete") ||
    afterStatus === "delivered" ||
    afterDelivery === "delivered" ||
    afterDelivery.includes("complete");
  const beforeDone =
    beforeStatus.includes("complete") ||
    beforeStatus === "delivered" ||
    beforeDelivery === "delivered" ||
    beforeDelivery.includes("complete");

  return afterDone && !beforeDone;
}

function resolveDriverId(data: DocumentData): string {
  for (const key of ["driverId", "assignedDriverId", "acceptedBy"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
/**
 * Atomic seat reservation for the limited driver launch campaign.
 * Slot is permanently secured once enrolled (enrolledCount never decreases).
 */
export const enrollDriverLaunchCampaign = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const db = getFirestore();
  const driverSnap = await db.doc(`drivers/${uid}`).get();
  if (!driverSnap.exists) {
    throw new HttpsError("failed-precondition", "Driver account required");
  }
  if (driverSnap.data()?.adminSuspended === true) {
    throw new HttpsError("failed-precondition", "Driver account is suspended");
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data() ?? {};
  const role = typeof user.role === "string" ? user.role : "";
  if (role !== "driver" && role !== "admin") {
    throw new HttpsError("permission-denied", "Drivers only");
  }

  const rating =
    typeof user.averageRating === "number"
      ? user.averageRating
      : typeof user.rating === "number"
        ? user.rating
        : null;
  const cancellationRate =
    typeof user.cancellationRate === "number" ? user.cancellationRate : 0;

  const driverName =
    (typeof driverSnap.data()?.name === "string" && driverSnap.data()!.name) ||
    (typeof user.displayName === "string" && user.displayName) ||
    (typeof user.name === "string" && user.name) ||
    "Driver";

  const driverCreatedMs =
    millisFromUnknown(driverSnap.data()?.createdAt) ??
    millisFromUnknown(user.createdAt) ??
    null;

  const result = await db.runTransaction(async (tx) => {
    const settingsRef = db.doc(SETTINGS_DOC);
    const enrollRef = db.doc(`${ENROLLMENTS}/${uid}`);
    const [settingsSnap, enrollSnap] = await Promise.all([
      tx.get(settingsRef),
      tx.get(enrollRef),
    ]);

    if (enrollSnap.exists) {
      const existing = enrollSnap.data() ?? {};
      return {
        ok: true,
        alreadyEnrolled: true,
        slotIndex:
          typeof existing.slotIndex === "number" ? existing.slotIndex : 0,
        message: "You are already enrolled in this promotion.",
      };
    }

    const settings = parseSettings(settingsSnap.data());
    const nowMs = Date.now();

    if (!canEnroll(settings, nowMs)) {
      if (!settings.enabled) {
        throw new HttpsError("failed-precondition", "Promotion is disabled");
      }
      if (settings.paused) {
        throw new HttpsError("failed-precondition", "Promotion is paused");
      }
      if (settings.startAtMs != null && nowMs < settings.startAtMs) {
        throw new HttpsError("failed-precondition", "Promotion has not started");
      }
      if (settings.endAtMs != null && nowMs > settings.endAtMs) {
        throw new HttpsError("failed-precondition", "Promotion has ended");
      }
      if (settings.enrolledCount >= settings.eligibleDriverLimit) {
        throw new HttpsError(
          "resource-exhausted",
          "Promotion limit reached. No seats remaining.",
        );
      }
      throw new HttpsError("failed-precondition", "Enrollment unavailable");
    }

    // Re-check limit inside transaction (never exceed).
    if (settings.enrolledCount >= settings.eligibleDriverLimit) {
      throw new HttpsError(
        "resource-exhausted",
        "Promotion limit reached. No seats remaining.",
      );
    }

    if (
      settings.minDriverRating != null &&
      (rating == null || rating < settings.minDriverRating)
    ) {
      throw new HttpsError(
        "failed-precondition",
        `Minimum rating of ${settings.minDriverRating} required`,
      );
    }

    if (
      settings.maxCancellationRate != null &&
      cancellationRate > settings.maxCancellationRate
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Cancellation rate is too high for this promotion",
      );
    }

    if (settings.newDriversOnly) {
      const cutoff = settings.startAtMs ?? nowMs;
      if (driverCreatedMs != null && driverCreatedMs < cutoff) {
        throw new HttpsError(
          "failed-precondition",
          "This promotion is for new drivers only",
        );
      }
    }

    const nextCount = settings.enrolledCount + 1;
    if (nextCount > settings.eligibleDriverLimit) {
      throw new HttpsError(
        "resource-exhausted",
        "Promotion limit reached. No seats remaining.",
      );
    }

    const slotIndex = nextCount;
    const requiredDeliveries = settings.requiredDeliveries;
    const bonusAmountCad = settings.bonusAmountCad;

    tx.set(enrollRef, {
      driverId: uid,
      driverName: String(driverName).trim() || "Driver",
      status: "active",
      slotIndex,
      bonusAmountCad,
      requiredDeliveries,
      completedDeliveries: 0,
      enrolledAtMs: nowMs,
      enrolledAt: FieldValue.serverTimestamp(),
      bonusUnlockedAtMs: null,
      bonusPaidAtMs: null,
      lastOrderId: null,
      progressRatio: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(
      settingsRef,
      {
        enrolledCount: nextCount,
        // Ensure defaults exist if doc was empty.
        enabled: settings.enabled,
        paused: settings.paused,
        bonusAmountCad,
        requiredDeliveries,
        eligibleDriverLimit: settings.eligibleDriverLimit,
        startAtMs: settings.startAtMs,
        endAtMs: settings.endAtMs,
        newDriversOnly: settings.newDriversOnly,
        minDriverRating: settings.minDriverRating,
        maxCancellationRate: settings.maxCancellationRate,
        driversCompleted: settings.driversCompleted,
        bonusesPaid: settings.bonusesPaid,
        totalBudgetPaidCad: settings.totalBudgetPaidCad,
        progressSum: settings.progressSum,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return {
      ok: true,
      alreadyEnrolled: false,
      slotIndex,
      message: `Seat ${slotIndex} reserved. Complete ${requiredDeliveries} deliveries to unlock $${bonusAmountCad.toFixed(0)} CAD.`,
    };
  });

  logger.info("enrollDriverLaunchCampaign", {uid, ...result});
  return result;
});

/** Admin marks a completed bonus as paid (does not touch delivery payouts). */
export const markDriverLaunchBonusPaid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const db = getFirestore();
  const adminSnap = await db.doc(`users/${uid}`).get();
  if (!isAdminRole(adminSnap.data()?.role)) {
    throw new HttpsError("permission-denied", "Admin only");
  }

  const driverId =
    typeof request.data?.driverId === "string"
      ? request.data.driverId.trim()
      : "";
  if (!driverId) {
    throw new HttpsError("invalid-argument", "driverId required");
  }

  await db.runTransaction(async (tx) => {
    const settingsRef = db.doc(SETTINGS_DOC);
    const enrollRef = db.doc(`${ENROLLMENTS}/${driverId}`);
    const [settingsSnap, enrollSnap] = await Promise.all([
      tx.get(settingsRef),
      tx.get(enrollRef),
    ]);
    if (!enrollSnap.exists) {
      throw new HttpsError("not-found", "Enrollment not found");
    }
    const enroll = enrollSnap.data() ?? {};
    if (enroll.status === "bonus_paid") {
      return;
    }
    if (enroll.status !== "bonus_unlocked") {
      throw new HttpsError(
        "failed-precondition",
        "Bonus is not unlocked yet",
      );
    }
    const settings = parseSettings(settingsSnap.data());
    const amount =
      typeof enroll.bonusAmountCad === "number"
        ? enroll.bonusAmountCad
        : settings.bonusAmountCad;
    const nowMs = Date.now();

    tx.set(
      enrollRef,
      {
        status: "bonus_paid",
        bonusPaidAtMs: nowMs,
        bonusPaidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    tx.set(
      settingsRef,
      {
        bonusesPaid: settings.bonusesPaid + 1,
        totalBudgetPaidCad: settings.totalBudgetPaidCad + amount,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    const ledgerRef = db.collection("balanceLedger").doc();
    tx.set(ledgerRef, {
      userId: driverId,
      type: "driver_launch_campaign_bonus",
      amount,
      currency: "CAD",
      status: "paid",
      enrollmentId: driverId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      note: "Limited Driver Launch Campaign bonus",
    });
  });

  return {ok: true};
});

/**
 * When a marketplace order completes, increment enrolled driver progress.
 * Idempotent per order via driverLaunchProgress/{orderId}.
 */
export const trackDriverLaunchCampaignProgress = onDocumentWritten(
  {
    document: "orders/{orderId}",
    region: "us-central1",
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const before = event.data?.before?.exists
      ? event.data.before.data()
      : undefined;
    const data = after.data() ?? {};
    if (!orderBecameCompleted(before, data)) return;

    const orderId = event.params.orderId;
    const driverId = resolveDriverId(data);
    if (!driverId) return;

    const db = getFirestore();
    const enrollRef = db.doc(`${ENROLLMENTS}/${driverId}`);
    const enrollSnap = await enrollRef.get();
    if (!enrollSnap.exists) return;

    const enroll = enrollSnap.data() ?? {};
    if (enroll.status !== "active") return;

    try {
      await db.runTransaction(async (tx) => {
        const settingsRef = db.doc(SETTINGS_DOC);
        const progressRef = db.doc(`${PROGRESS}/${orderId}`);
        const [settingsSnap, enrollFresh, progressSnap] = await Promise.all([
          tx.get(settingsRef),
          tx.get(enrollRef),
          tx.get(progressRef),
        ]);

        if (progressSnap.exists) return;
        if (!enrollFresh.exists) return;

        const row = enrollFresh.data() ?? {};
        if (row.status !== "active") return;

        const settings = parseSettings(settingsSnap.data());
        const nowMs = Date.now();
        if (!canProgress(settings, nowMs)) {
          tx.set(
            enrollRef,
            {
              status: "expired",
              updatedAt: FieldValue.serverTimestamp(),
            },
            {merge: true},
          );
          return;
        }

        const required = Math.max(
          1,
          Math.floor(
            asNumber(row.requiredDeliveries, settings.requiredDeliveries),
          ),
        );
        const prevCompleted = Math.max(
          0,
          Math.floor(asNumber(row.completedDeliveries, 0)),
        );
        const nextCompleted = prevCompleted + 1;
        const prevRatio =
          typeof row.progressRatio === "number"
            ? row.progressRatio
            : Math.min(1, prevCompleted / required);
        const nextRatio = Math.min(1, nextCompleted / required);
        const unlocked = nextCompleted >= required;

        tx.set(progressRef, {
          orderId,
          driverId,
          countedAtMs: nowMs,
          countedAt: FieldValue.serverTimestamp(),
        });

        tx.set(
          enrollRef,
          {
            completedDeliveries: nextCompleted,
            progressRatio: nextRatio,
            lastOrderId: orderId,
            ...(unlocked
              ? {
                status: "bonus_unlocked",
                bonusUnlockedAtMs: nowMs,
                bonusUnlockedAt: FieldValue.serverTimestamp(),
              }
              : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );

        const progressDelta = nextRatio - prevRatio;
        tx.set(
          settingsRef,
          {
            progressSum: settings.progressSum + progressDelta,
            ...(unlocked
              ? {driversCompleted: settings.driversCompleted + 1}
              : {}),
            updatedAtMs: nowMs,
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
      });
    } catch (err) {
      logger.error("trackDriverLaunchCampaignProgress failed", {
        orderId,
        driverId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
);
