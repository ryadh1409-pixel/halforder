import * as admin from "firebase-admin";

const WALLET_BALANCES = "walletBalances";
const CASHBACK_TRANSACTIONS = "cashbackTransactions";
const CASHBACK_SETTINGS = "platformSettings/cashbackRewards";

type OrderData = Record<string, unknown>;
type RedemptionStatus = "reserved" | "used" | "released" | "reversed";

interface StoredOrderTotals {
  customerTotalCents: number;
  totalCents: number;
  totalPriceCents: number;
}

export interface HalfOrderCashReservation {
  appliedCents: number;
  originalCustomerTotalCents: number;
  remainingCents: number;
  newlyReserved: boolean;
}

function integerCents(value: unknown): number {
  return readIntegerCents(value) ?? 0;
}

function readIntegerCents(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function moneyToCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100)
    : null;
}

function centsToCad(cents: number): number {
  return Math.round(cents) / 100;
}

function ownerId(order: OrderData): string {
  if (typeof order.userId === "string" && order.userId.trim()) {
    return order.userId.trim();
  }
  if (typeof order.customerId === "string" && order.customerId.trim()) {
    return order.customerId.trim();
  }
  return "";
}

function readOrderTotals(order: OrderData): StoredOrderTotals {
  const customerTotalCents =
    moneyToCents(order.customerTotal) ??
    moneyToCents(order.total) ??
    moneyToCents(order.totalPrice) ??
    0;
  return {
    customerTotalCents,
    totalCents: moneyToCents(order.total) ?? customerTotalCents,
    totalPriceCents: moneyToCents(order.totalPrice) ?? customerTotalCents,
  };
}

function readStoredOrderTotals(
  transactionData: OrderData,
  fallbackCents: number,
): StoredOrderTotals {
  const stored =
    transactionData.originalOrderTotals !== null &&
    typeof transactionData.originalOrderTotals === "object"
      ? (transactionData.originalOrderTotals as OrderData)
      : {};
  return {
    customerTotalCents:
      readIntegerCents(stored.customerTotalCents) ??
      readIntegerCents(transactionData.originalCustomerTotalCents) ??
      fallbackCents,
    totalCents: readIntegerCents(stored.totalCents) ?? fallbackCents,
    totalPriceCents:
      readIntegerCents(stored.totalPriceCents) ?? fallbackCents,
  };
}

function redemptionDocId(orderId: string): string {
  return `use_${orderId}`;
}

function isReserved(data: OrderData): boolean {
  return (
    data.status === "pending" ||
    data.status === "reserved" ||
    data.redemptionStatus === "reserved"
  );
}

function restoredOrderPatch(
  totals: StoredOrderTotals,
  status: RedemptionStatus,
): OrderData {
  return {
    customerTotal: centsToCad(totals.customerTotalCents),
    total: centsToCad(totals.totalCents),
    totalPrice: centsToCad(totals.totalPriceCents),
    halfOrderCashAppliedCents: 0,
    halfOrderCashAppliedCad: 0,
    halfOrderCashRedemptionStatus: status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Reserves the caller's available HalfOrder Cash against the authoritative
 * order total. The deterministic ledger document makes callable retries safe.
 */
export async function reserveHalfOrderCash(params: {
  uid: string;
  orderId: string;
}): Promise<HalfOrderCashReservation> {
  const {uid, orderId} = params;
  const db = admin.firestore();
  const walletRef = db.doc(`${WALLET_BALANCES}/${uid}`);
  const orderRef = db.doc(`orders/${orderId}`);
  const transactionRef = db.doc(
    `${CASHBACK_TRANSACTIONS}/${redemptionDocId(orderId)}`,
  );
  let result: HalfOrderCashReservation = {
    appliedCents: 0,
    originalCustomerTotalCents: 0,
    remainingCents: 0,
    newlyReserved: false,
  };

  await db.runTransaction(async (tx) => {
    const [walletSnap, orderSnap, redemptionSnap] = await Promise.all([
      tx.get(walletRef),
      tx.get(orderRef),
      tx.get(transactionRef),
    ]);
    if (!orderSnap.exists) {
      throw new Error(`Order ${orderId} does not exist.`);
    }

    const order = orderSnap.data() ?? {};
    if (ownerId(order) !== uid) {
      throw new Error(`Order ${orderId} is not owned by ${uid}.`);
    }

    const redemption = redemptionSnap.data() ?? {};
    const priorAmountCents = integerCents(redemption.amountCents);
    if (isReserved(redemption) || redemption.status === "used") {
      const originalCustomerTotalCents =
        integerCents(redemption.originalCustomerTotalCents) ||
        integerCents(order.originalCustomerTotalCents) ||
        readOrderTotals(order).customerTotalCents + priorAmountCents;
      result = {
        appliedCents: priorAmountCents,
        originalCustomerTotalCents,
        remainingCents: Math.max(
          0,
          originalCustomerTotalCents - priorAmountCents,
        ),
        newlyReserved: false,
      };
      return;
    }

    const originalTotals = readOrderTotals(order);
    const wallet = walletSnap.data() ?? {};
    const availableCents = integerCents(wallet.availableCents);
    const reservedCents = integerCents(wallet.reservedCents);
    const appliedCents = Math.min(
      availableCents,
      originalTotals.customerTotalCents,
    );
    const remainingCents = Math.max(
      0,
      originalTotals.customerTotalCents - appliedCents,
    );
    result = {
      appliedCents,
      originalCustomerTotalCents: originalTotals.customerTotalCents,
      remainingCents,
      newlyReserved: appliedCents > 0,
    };
    if (appliedCents === 0) return;

    tx.set(
      walletRef,
      {
        availableCents: availableCents - appliedCents,
        reservedCents: reservedCents + appliedCents,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      transactionRef,
      {
        type: "redemption",
        status: "pending",
        redemptionStatus: "reserved",
        amountCents: appliedCents,
        amountCad: centsToCad(appliedCents),
        ledgerEffectCents: -appliedCents,
        uid,
        userId: uid,
        customerId: uid,
        orderId,
        originalCustomerTotalCents: originalTotals.customerTotalCents,
        originalOrderTotals: originalTotals,
        ...(redemptionSnap.exists
          ? {
              usedAt: admin.firestore.FieldValue.delete(),
              releasedAt: admin.firestore.FieldValue.delete(),
              reversedAt: admin.firestore.FieldValue.delete(),
              releaseReason: admin.firestore.FieldValue.delete(),
            }
          : {}),
        createdAt: redemptionSnap.exists
          ? redemption.createdAt ??
            admin.firestore.FieldValue.serverTimestamp()
          : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      orderRef,
      {
        halfOrderCashAppliedCents: appliedCents,
        halfOrderCashAppliedCad: centsToCad(appliedCents),
        halfOrderCashRedemptionStatus: "reserved",
        originalCustomerTotalCents: originalTotals.customerTotalCents,
        customerTotal: centsToCad(remainingCents),
        total: centsToCad(remainingCents),
        totalPrice: centsToCad(remainingCents),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });

  return result;
}

async function transitionReservedRedemption(
  orderId: string,
  target: "used" | "released",
  reason?: string,
): Promise<boolean> {
  const db = admin.firestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const transactionRef = db.doc(
    `${CASHBACK_TRANSACTIONS}/${redemptionDocId(orderId)}`,
  );
  let changed = false;

  await db.runTransaction(async (tx) => {
    const settingsRef = db.doc(CASHBACK_SETTINGS);
    const [redemptionSnap, orderSnap, settingsSnap] = await Promise.all([
      tx.get(transactionRef),
      tx.get(orderRef),
      tx.get(settingsRef),
    ]);
    if (!redemptionSnap.exists) return;
    const redemption = redemptionSnap.data() ?? {};
    if (!isReserved(redemption)) return;

    const uid =
      typeof redemption.uid === "string" ? redemption.uid.trim() : "";
    const amountCents = integerCents(redemption.amountCents);
    if (!uid || amountCents === 0) return;

    const walletRef = db.doc(`${WALLET_BALANCES}/${uid}`);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.data() ?? {};
    const reservedCents = integerCents(wallet.reservedCents);
    const walletPatch: OrderData = {
      reservedCents: Math.max(0, reservedCents - amountCents),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (target === "used") {
      walletPatch.redeemedCents =
        integerCents(wallet.redeemedCents) + amountCents;
      tx.set(
        settingsRef,
        {
          totalRedeemedCents:
            integerCents(settingsSnap.data()?.totalRedeemedCents) + amountCents,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      tx.set(
        transactionRef,
        {
          status: "used",
          redemptionStatus: "used",
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      if (orderSnap.exists) {
        tx.set(
          orderRef,
          {
            halfOrderCashRedemptionStatus: "used",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
      }
    } else {
      walletPatch.availableCents =
        integerCents(wallet.availableCents) + amountCents;
      const fallback =
        integerCents(redemption.originalCustomerTotalCents) + amountCents;
      const totals = readStoredOrderTotals(redemption, fallback);
      tx.set(
        transactionRef,
        {
          status: "available",
          redemptionStatus: "released",
          releaseReason: reason ?? null,
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      if (orderSnap.exists) {
        tx.set(orderRef, restoredOrderPatch(totals, "released"), {merge: true});
      }
    }

    tx.set(walletRef, walletPatch, {merge: true});
    changed = true;
  });

  return changed;
}

/** Finalizes a reserved redemption after authoritative payment success. */
export async function finalizeHalfOrderCashRedemption(
  orderId: string,
): Promise<boolean> {
  return transitionReservedRedemption(orderId, "used");
}

/** Releases a pending reservation and restores the pre-redemption order totals. */
export async function releaseHalfOrderCashRedemption(
  orderId: string,
  reason?: string,
): Promise<boolean> {
  return transitionReservedRedemption(orderId, "released", reason);
}

/** Reverses a used redemption after Stripe reports a refunded charge. */
export async function reverseHalfOrderCashRedemption(
  orderId: string,
): Promise<boolean> {
  const db = admin.firestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const transactionRef = db.doc(
    `${CASHBACK_TRANSACTIONS}/${redemptionDocId(orderId)}`,
  );
  let changed = false;

  await db.runTransaction(async (tx) => {
    const settingsRef = db.doc(CASHBACK_SETTINGS);
    const [redemptionSnap, orderSnap, settingsSnap] = await Promise.all([
      tx.get(transactionRef),
      tx.get(orderRef),
      tx.get(settingsRef),
    ]);
    if (!redemptionSnap.exists) return;
    const redemption = redemptionSnap.data() ?? {};
    if (redemption.status !== "used") return;

    const uid =
      typeof redemption.uid === "string" ? redemption.uid.trim() : "";
    const amountCents = integerCents(redemption.amountCents);
    if (!uid || amountCents === 0) return;

    const walletRef = db.doc(`${WALLET_BALANCES}/${uid}`);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.data() ?? {};
    tx.set(
      walletRef,
      {
        availableCents: integerCents(wallet.availableCents) + amountCents,
        redeemedCents: Math.max(
          0,
          integerCents(wallet.redeemedCents) - amountCents,
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      transactionRef,
      {
        status: "available",
        redemptionStatus: "reversed",
        reversedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      settingsRef,
      {
        totalRedeemedCents: Math.max(
          0,
          integerCents(settingsSnap.data()?.totalRedeemedCents) - amountCents,
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    if (orderSnap.exists) {
      const fallback =
        integerCents(redemption.originalCustomerTotalCents) + amountCents;
      const totals = readStoredOrderTotals(redemption, fallback);
      tx.set(orderRef, restoredOrderPatch(totals, "reversed"), {merge: true});
    }
    changed = true;
  });

  return changed;
}

/**
 * Removes cashback earned by an order after Stripe reports a refund.
 * The deterministic award document makes repeated refund events harmless.
 */
export async function reverseCashbackAwardForOrder(
  orderId: string,
): Promise<boolean> {
  const db = admin.firestore();
  const transactionRef = db.doc(
    `${CASHBACK_TRANSACTIONS}/award_${orderId}`,
  );
  const settingsRef = db.doc(CASHBACK_SETTINGS);
  let changed = false;

  await db.runTransaction(async (tx) => {
    const [awardSnap, settingsSnap] = await Promise.all([
      tx.get(transactionRef),
      tx.get(settingsRef),
    ]);
    if (!awardSnap.exists) return;
    const award = awardSnap.data() ?? {};
    if (award.status !== "pending" && award.status !== "available") return;

    const uid =
      typeof award.customerId === "string" ? award.customerId.trim() : "";
    const amountCents = integerCents(award.amountCents);
    if (!uid || amountCents === 0) return;

    const walletRef = db.doc(`${WALLET_BALANCES}/${uid}`);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.data() ?? {};
    const wasPending = award.status === "pending";
    const pendingCents = integerCents(wallet.pendingCents);
    const availableCents = integerCents(wallet.availableCents);
    const reservedCents = integerCents(wallet.reservedCents);
    const nextPending = wasPending
      ? Math.max(0, pendingCents - amountCents)
      : pendingCents;
    const nextAvailable = wasPending
      ? availableCents
      : Math.max(0, availableCents - amountCents);
    const nextActive = nextPending + nextAvailable + reservedCents > 0;

    tx.set(
      walletRef,
      {
        pendingCents: nextPending,
        availableCents: nextAvailable,
        isActive: nextActive,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      transactionRef,
      {
        status: "cancelled",
        cancellationReason: "stripe_refund",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAtMs: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    const settings = settingsSnap.data() ?? {};
    const settingsPatch: OrderData = {
      rewardsCommittedCents: Math.max(
        0,
        integerCents(settings.rewardsCommittedCents) - amountCents,
      ),
      pendingCashbackCents: wasPending
        ? Math.max(
            0,
            integerCents(settings.pendingCashbackCents) - amountCents,
          )
        : integerCents(settings.pendingCashbackCents),
      totalIssuedCents: wasPending
        ? integerCents(settings.totalIssuedCents)
        : Math.max(
            0,
            integerCents(settings.totalIssuedCents) - amountCents,
          ),
      cancelledRewards: integerCents(settings.cancelledRewards) + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (wallet.isActive === true && !nextActive) {
      settingsPatch.activeUsers = Math.max(
        0,
        integerCents(settings.activeUsers) - 1,
      );
    }
    tx.set(settingsRef, settingsPatch, {merge: true});
    changed = true;
  });

  return changed;
}
