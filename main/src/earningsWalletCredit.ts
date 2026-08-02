/**
 * Idempotent earnings-wallet credits when an order becomes completed / earningsRecorded.
 * Ledger-style: immutable docs keyed by idempotency ids; balances updated with runningBalance.
 */

import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {
  calculateAdminOrderRevenue,
  calculateDriverWalletEarnings,
  calculateRestaurantEarnings,
  mapOrderItemsForSnapshot,
  normalizeEarningsWalletConfig,
  resolveServiceFeeFromOrder,
  resolveTaxFromOrder,
  type EarningsWalletConfig,
  type OrderEarningsInputs,
} from "./earningsWalletMath.js";

const db = getFirestore();

export const EARNINGS_WALLETS = "earningsWallets";
export const EARNINGS_LEDGER = "earningsLedger";
export const ADMIN_WALLET_ID = "admin_platform";
export const ADMIN_OWNER_ID = "platform";

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function walletId(ownerType: "restaurant" | "driver" | "admin", ownerId: string): string {
  if (ownerType === "admin") return ADMIN_WALLET_ID;
  return `${ownerType}_${ownerId}`;
}

function asOrderInputs(data: DocumentData): OrderEarningsInputs {
  return {
    items: Array.isArray(data.items) ? data.items : undefined,
    subtotal: data.subtotal,
    totalPrice: data.totalPrice ?? data.total,
    deliveryFee: data.deliveryFee,
    fees: data.fees,
    tax: data.tax,
    taxes: data.taxes,
    serviceFee: data.serviceFee,
    tip: data.tip,
  };
}

function isCompletionEligible(data: DocumentData | undefined): boolean {
  if (!data) return false;
  if (data.earningsRecorded === true) return true;
  const status = String(data.status ?? "").toLowerCase();
  const delivery = String(data.deliveryStatus ?? "").toLowerCase();
  return (
    status === "completed" ||
    status === "delivered" ||
    delivery === "delivered" ||
    data.marketplaceArchived === true
  );
}

function shouldCredit(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  if (!isCompletionEligible(after)) return false;
  if (isCompletionEligible(before) && before?.earningsWalletsCredited === true) return false;
  if (after?.earningsWalletsCredited === true) return false;
  // Fire when newly completed OR newly earningsRecorded
  const newlyRecorded =
    before?.earningsRecorded !== true && after?.earningsRecorded === true;
  const newlyCompleted = !isCompletionEligible(before) && isCompletionEligible(after);
  return newlyRecorded || newlyCompleted || after?.earningsWalletsCredited !== true;
}

async function loadConfig(): Promise<EarningsWalletConfig> {
  const snap = await db.doc("platformSettings/earningsWalletConfig").get();
  return normalizeEarningsWalletConfig(
    snap.exists ? (snap.data() as Partial<EarningsWalletConfig>) : null,
  );
}

type LedgerDraft = {
  id: string;
  walletId: string;
  ownerType: "restaurant" | "driver" | "admin";
  ownerId: string;
  type: string;
  amount: number;
  signedAmount: number;
  description: string;
  orderId: string;
  source: string;
  notes?: string | null;
  restaurantSnapshot?: DocumentData | null;
  driverSnapshot?: DocumentData | null;
  adminSnapshot?: DocumentData | null;
};

async function applyLedgerBatch(
  orderId: string,
  drafts: LedgerDraft[],
  walletPatches: Map<
    string,
    {
      ownerType: "restaurant" | "driver" | "admin";
      ownerId: string;
      credit: number;
      extras: Record<string, number>;
    }
  >,
): Promise<boolean> {
  if (drafts.length === 0) return false;

  const orderRef = db.doc(`orders/${orderId}`);

  await db.runTransaction(async (tx: Transaction) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return;
    const orderData = orderSnap.data() as DocumentData;
    if (orderData.earningsWalletsCredited === true) return;

    const ledgerRefs = drafts.map((d) => db.doc(`${EARNINGS_LEDGER}/${d.id}`));
    const ledgerSnaps = await Promise.all(ledgerRefs.map((r) => tx.get(r)));
    const missingDrafts: Array<{ draft: LedgerDraft; ref: DocumentReference }> = [];
    for (let i = 0; i < drafts.length; i++) {
      if (!ledgerSnaps[i].exists) {
        missingDrafts.push({draft: drafts[i], ref: ledgerRefs[i]});
      }
    }

    // Still mark order credited if all ledger rows already exist (retry-safe).
    if (missingDrafts.length === 0) {
      tx.set(
        orderRef,
        {
          earningsWalletsCredited: true,
          earningsWalletsCreditedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      return;
    }

    // Only apply wallet deltas for ledger rows we are creating now (partial-retry safe).
    const effectivePatches = new Map<
      string,
      {
        ownerType: "restaurant" | "driver" | "admin";
        ownerId: string;
        credit: number;
        extras: Record<string, number>;
      }
    >();
    for (const {draft} of missingDrafts) {
      const full = walletPatches.get(draft.walletId);
      if (!full) continue;
      const prev = effectivePatches.get(draft.walletId) ?? {
        ownerType: full.ownerType,
        ownerId: full.ownerId,
        credit: 0,
        extras: {},
      };
      // Reconstruct per-entry extras proportionally is hard; recompute from draft type.
      const extras: Record<string, number> = {...prev.extras};
      if (draft.type === "restaurant_order_credit") {
        extras.restaurantTotalEarnings = money(
          (extras.restaurantTotalEarnings ?? 0) + draft.amount,
        );
      } else if (draft.type === "driver_delivery_credit") {
        extras.totalDeliveries = (extras.totalDeliveries ?? 0) + 1;
        const bonus = money(Number(draft.driverSnapshot?.bonus ?? 0));
        const deliveryEarn = money(Number(draft.driverSnapshot?.deliveryEarnings ?? 0));
        extras.bonusEarnings = money((extras.bonusEarnings ?? 0) + bonus);
        extras.deliveryEarnings = money((extras.deliveryEarnings ?? 0) + deliveryEarn);
      } else if (draft.type === "admin_restaurant_commission") {
        extras.totalRevenue = money((extras.totalRevenue ?? 0) + draft.amount);
        extras.restaurantCommissions = money(
          (extras.restaurantCommissions ?? 0) + draft.amount,
        );
        extras.netPlatformRevenue = money(
          (extras.netPlatformRevenue ?? 0) + draft.signedAmount,
        );
      } else if (draft.type === "admin_driver_commission") {
        extras.totalRevenue = money((extras.totalRevenue ?? 0) + draft.amount);
        extras.driverCommissions = money((extras.driverCommissions ?? 0) + draft.amount);
        extras.netPlatformRevenue = money(
          (extras.netPlatformRevenue ?? 0) + draft.signedAmount,
        );
      } else if (draft.type === "admin_service_fee") {
        extras.totalRevenue = money((extras.totalRevenue ?? 0) + draft.amount);
        extras.serviceFees = money((extras.serviceFees ?? 0) + draft.amount);
        extras.netPlatformRevenue = money(
          (extras.netPlatformRevenue ?? 0) + draft.signedAmount,
        );
      } else if (draft.type === "admin_platform_fee") {
        extras.totalRevenue = money((extras.totalRevenue ?? 0) + draft.amount);
        extras.platformFees = money((extras.platformFees ?? 0) + draft.amount);
        extras.netPlatformRevenue = money(
          (extras.netPlatformRevenue ?? 0) + draft.signedAmount,
        );
      } else if (draft.type === "admin_promotional_bonus_paid") {
        extras.promotionalBonusPaid = money(
          (extras.promotionalBonusPaid ?? 0) + draft.amount,
        );
        extras.netPlatformRevenue = money(
          (extras.netPlatformRevenue ?? 0) + draft.signedAmount,
        );
      }
      effectivePatches.set(draft.walletId, {
        ownerType: full.ownerType,
        ownerId: full.ownerId,
        credit: money(prev.credit + Math.max(0, draft.signedAmount)),
        extras,
      });
    }

    const walletIds = [...effectivePatches.keys()];
    const walletRefs = walletIds.map((id) => db.doc(`${EARNINGS_WALLETS}/${id}`));
    const walletSnaps = await Promise.all(walletRefs.map((r) => tx.get(r)));
    const balances = new Map<string, number>();
    const existing = new Map<string, DocumentData>();
    for (let i = 0; i < walletIds.length; i++) {
      const id = walletIds[i];
      const data = walletSnaps[i].exists ? (walletSnaps[i].data() as DocumentData) : {};
      existing.set(id, data);
      balances.set(id, money(Number(data.currentBalance ?? 0)));
    }

    const now = FieldValue.serverTimestamp();

    for (const {draft, ref} of missingDrafts) {
      const prev = balances.get(draft.walletId) ?? 0;
      const next = money(prev + draft.signedAmount);
      balances.set(draft.walletId, next);
      tx.set(ref, {
        walletId: draft.walletId,
        ownerType: draft.ownerType,
        ownerId: draft.ownerId,
        type: draft.type,
        status: "completed",
        amount: draft.amount,
        signedAmount: draft.signedAmount,
        runningBalance: next,
        orderId: draft.orderId,
        description: draft.description,
        notes: draft.notes ?? null,
        source: draft.source,
        sender: null,
        reason: null,
        referenceId: draft.orderId,
        idempotencyKey: draft.id,
        restaurantSnapshot: draft.restaurantSnapshot ?? null,
        driverSnapshot: draft.driverSnapshot ?? null,
        adminSnapshot: draft.adminSnapshot ?? null,
        createdAt: now,
        completedAt: now,
      });
    }

    for (let i = 0; i < walletIds.length; i++) {
      const id = walletIds[i];
      const patch = effectivePatches.get(id);
      if (!patch) continue;
      const prevData = existing.get(id) ?? {};
      const nextBal = balances.get(id) ?? 0;
      const lifetime = money(Number(prevData.lifetimeEarnings ?? 0) + Math.max(0, patch.credit));
      const totalEarnings = money(Number(prevData.totalEarnings ?? 0) + Math.max(0, patch.credit));
      const update: DocumentData = {
        ownerType: patch.ownerType,
        ownerId: patch.ownerId,
        currentBalance: nextBal,
        availableBalance: nextBal,
        pendingBalance: money(Number(prevData.pendingBalance ?? 0)),
        lifetimeEarnings: lifetime,
        totalEarnings,
        totalWithdrawn: money(Number(prevData.totalWithdrawn ?? 0)),
        updatedAt: now,
        createdAt: prevData.createdAt ?? now,
      };
      for (const [k, v] of Object.entries(patch.extras)) {
        if (k === "totalDeliveries") {
          update[k] = Number(prevData[k] ?? 0) + v;
        } else {
          update[k] = money(Number(prevData[k] ?? 0) + v);
        }
      }
      tx.set(walletRefs[i], update, {merge: true});
    }

    tx.set(
      orderRef,
      {
        earningsWalletsCredited: true,
        earningsWalletsCreditedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });

  return true;
}

/**
 * Credits restaurant, driver, and admin wallets for a completed order.
 * Safe to call multiple times — idempotent via ledger doc ids + order flag.
 */
export async function creditEarningsWalletsForOrder(
  orderId: string,
  orderData: DocumentData,
): Promise<{credited: boolean; reason: string}> {
  const restaurantId = str(orderData.restaurantId) ?? str(orderData.venueId);
  const driverId =
    str(orderData.driverId) ??
    str(orderData.assignedDriverId) ??
    str(orderData.courierId);

  if (!restaurantId && !driverId) {
    return {credited: false, reason: "no_restaurant_or_driver"};
  }

  const config = await loadConfig();
  const inputs = asOrderInputs(orderData);
  const restaurant = calculateRestaurantEarnings(inputs, config);
  const driver = calculateDriverWalletEarnings(inputs, config);
  const admin = calculateAdminOrderRevenue(restaurant, driver, inputs, config);

  const orderNumber =
    str(orderData.orderNumber) ??
    str(orderData.orderCode) ??
    orderId.slice(0, 8).toUpperCase();
  const receiptNumber =
    str(orderData.receiptNumber) ??
    str(orderData.receiptId) ??
    orderNumber;
  const customerName =
    str(orderData.customerName) ??
    str(orderData.userName) ??
    str(orderData.buyerName);
  const deliveryAddress =
    str(orderData.deliveryAddress) ??
    (typeof orderData.deliveryLocation === "object" &&
    orderData.deliveryLocation &&
    str((orderData.deliveryLocation as DocumentData).address)
      ? str((orderData.deliveryLocation as DocumentData).address)
      : null);
  const paymentMethod =
    str(orderData.paymentMethod) ??
    str(orderData.paymentType) ??
    str(orderData.paidWith) ??
    "card";
  const orderStatus = str(orderData.status) ?? "completed";
  const serviceFee = resolveServiceFeeFromOrder(inputs, config);
  const taxes = resolveTaxFromOrder(inputs);

  const drafts: LedgerDraft[] = [];
  const walletPatches = new Map<
    string,
    {
      ownerType: "restaurant" | "driver" | "admin";
      ownerId: string;
      credit: number;
      extras: Record<string, number>;
    }
  >();

  const bump = (
    id: string,
    ownerType: "restaurant" | "driver" | "admin",
    ownerId: string,
    credit: number,
    extras: Record<string, number>,
  ) => {
    const prev = walletPatches.get(id) ?? {ownerType, ownerId, credit: 0, extras: {}};
    const mergedExtras = {...prev.extras};
    for (const [k, v] of Object.entries(extras)) {
      mergedExtras[k] = money((mergedExtras[k] ?? 0) + v);
    }
    walletPatches.set(id, {
      ownerType,
      ownerId,
      credit: money(prev.credit + credit),
      extras: mergedExtras,
    });
  };

  if (restaurantId && restaurant.netRestaurantEarnings > 0) {
    const wid = walletId("restaurant", restaurantId);
    drafts.push({
      id: `rest_earn_${orderId}`,
      walletId: wid,
      ownerType: "restaurant",
      ownerId: restaurantId,
      type: "restaurant_order_credit",
      amount: restaurant.netRestaurantEarnings,
      signedAmount: restaurant.netRestaurantEarnings,
      description: `Order ${orderNumber} restaurant earnings`,
      orderId,
      source: "order_completion",
      notes: customerName ? `Customer: ${customerName}` : null,
      restaurantSnapshot: {
        orderNumber,
        receiptNumber,
        customerName,
        deliveryAddress,
        paymentMethod,
        orderStatus,
        items: mapOrderItemsForSnapshot(inputs.items),
        subtotal: restaurant.foodTotal,
        foodTotal: restaurant.foodTotal,
        serviceFee,
        taxes,
        restaurantCommission: restaurant.restaurantCommission,
        restaurantCommissionPercent: restaurant.restaurantCommissionPercent,
        deductions: restaurant.deductions,
        netRestaurantEarnings: restaurant.netRestaurantEarnings,
      },
    });
    bump(wid, "restaurant", restaurantId, restaurant.netRestaurantEarnings, {
      restaurantTotalEarnings: restaurant.netRestaurantEarnings,
    });
  }

  if (driverId && driver.netAmount > 0) {
    const wid = walletId("driver", driverId);
    drafts.push({
      id: `drv_earn_${orderId}`,
      walletId: wid,
      ownerType: "driver",
      ownerId: driverId,
      type: "driver_delivery_credit",
      amount: driver.netAmount,
      signedAmount: driver.netAmount,
      description: `Delivery earnings for order ${orderNumber}`,
      orderId,
      source: "order_completion",
      driverSnapshot: {
        deliveryFee: driver.deliveryFee,
        driverCommissionPercent: driver.driverCommissionPercent,
        commissionAmount: driver.commissionAmount,
        deliveryEarnings: driver.deliveryEarnings,
        bonus: driver.bonus,
        bonusEnabled: driver.bonusEnabled,
        netAmount: driver.netAmount,
      },
    });
    bump(wid, "driver", driverId, driver.netAmount, {
      totalDeliveries: 1,
      bonusEarnings: driver.bonus,
      deliveryEarnings: driver.deliveryEarnings,
    });
  }

  const adminWid = ADMIN_WALLET_ID;
  if (admin.restaurantCommission > 0) {
    drafts.push({
      id: `adm_rest_comm_${orderId}`,
      walletId: adminWid,
      ownerType: "admin",
      ownerId: ADMIN_OWNER_ID,
      type: "admin_restaurant_commission",
      amount: admin.restaurantCommission,
      signedAmount: admin.restaurantCommission,
      description: `Restaurant commission — order ${orderNumber}`,
      orderId,
      source: "restaurant_commission",
      adminSnapshot: {
        source: "restaurant_commission",
        referenceId: orderId,
        relatedOrderId: orderId,
      },
    });
    bump(adminWid, "admin", ADMIN_OWNER_ID, admin.restaurantCommission, {
      totalRevenue: admin.restaurantCommission,
      restaurantCommissions: admin.restaurantCommission,
      netPlatformRevenue: admin.restaurantCommission,
    });
  }
  if (admin.driverCommission > 0) {
    drafts.push({
      id: `adm_drv_comm_${orderId}`,
      walletId: adminWid,
      ownerType: "admin",
      ownerId: ADMIN_OWNER_ID,
      type: "admin_driver_commission",
      amount: admin.driverCommission,
      signedAmount: admin.driverCommission,
      description: `Driver commission — order ${orderNumber}`,
      orderId,
      source: "driver_commission",
      adminSnapshot: {
        source: "driver_commission",
        referenceId: orderId,
        relatedOrderId: orderId,
      },
    });
    bump(adminWid, "admin", ADMIN_OWNER_ID, admin.driverCommission, {
      totalRevenue: admin.driverCommission,
      driverCommissions: admin.driverCommission,
      netPlatformRevenue: admin.driverCommission,
    });
  }
  if (admin.serviceFee > 0) {
    drafts.push({
      id: `adm_svc_${orderId}`,
      walletId: adminWid,
      ownerType: "admin",
      ownerId: ADMIN_OWNER_ID,
      type: "admin_service_fee",
      amount: admin.serviceFee,
      signedAmount: admin.serviceFee,
      description: `Service fee — order ${orderNumber}`,
      orderId,
      source: "service_fee",
      adminSnapshot: {
        source: "service_fee",
        referenceId: orderId,
        relatedOrderId: orderId,
      },
    });
    bump(adminWid, "admin", ADMIN_OWNER_ID, admin.serviceFee, {
      totalRevenue: admin.serviceFee,
      serviceFees: admin.serviceFee,
      netPlatformRevenue: admin.serviceFee,
    });
  }
  if (admin.platformFee > 0) {
    drafts.push({
      id: `adm_plat_${orderId}`,
      walletId: adminWid,
      ownerType: "admin",
      ownerId: ADMIN_OWNER_ID,
      type: "admin_platform_fee",
      amount: admin.platformFee,
      signedAmount: admin.platformFee,
      description: `Platform fee — order ${orderNumber}`,
      orderId,
      source: "platform_fee",
      adminSnapshot: {
        source: "platform_fee",
        referenceId: orderId,
        relatedOrderId: orderId,
      },
    });
    bump(adminWid, "admin", ADMIN_OWNER_ID, admin.platformFee, {
      totalRevenue: admin.platformFee,
      platformFees: admin.platformFee,
      netPlatformRevenue: admin.platformFee,
    });
  }
  if (admin.promotionalBonusPaid > 0) {
    drafts.push({
      id: `adm_bonus_${orderId}`,
      walletId: adminWid,
      ownerType: "admin",
      ownerId: ADMIN_OWNER_ID,
      type: "admin_promotional_bonus_paid",
      amount: admin.promotionalBonusPaid,
      signedAmount: -admin.promotionalBonusPaid,
      description: `Promotional delivery bonus paid — order ${orderNumber}`,
      orderId,
      source: "promotional_bonus",
      adminSnapshot: {
        source: "promotional_bonus_paid",
        referenceId: orderId,
        relatedOrderId: orderId,
      },
    });
    bump(adminWid, "admin", ADMIN_OWNER_ID, -admin.promotionalBonusPaid, {
      promotionalBonusPaid: admin.promotionalBonusPaid,
      netPlatformRevenue: -admin.promotionalBonusPaid,
    });
  }

  if (drafts.length === 0) {
    // Mark credited so we don't retry forever on zero-amount edge cases.
    await orderRefSafeMark(orderId);
    return {credited: false, reason: "zero_amounts"};
  }

  try {
    await applyLedgerBatch(orderId, drafts, walletPatches);
    logger.info("[earnings-wallet] credited", {
      orderId,
      restaurantId,
      driverId,
      entries: drafts.length,
      restaurantNet: restaurant.netRestaurantEarnings,
      driverNet: driver.netAmount,
      adminNetDelta: admin.netPlatformRevenueDelta,
    });
    return {credited: true, reason: "ok"};
  } catch (err) {
    logger.error("[earnings-wallet] credit failed", {orderId, err});
    throw err;
  }
}

async function orderRefSafeMark(orderId: string): Promise<void> {
  await db.doc(`orders/${orderId}`).set(
    {
      earningsWalletsCredited: true,
      earningsWalletsCreditedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

export function shouldCreditEarningsWallets(
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): boolean {
  return shouldCredit(before, after);
}
