import * as admin from "firebase-admin";
import type {CallableContext} from "firebase-functions/v1/https";
import * as functions from "firebase-functions/v1";
import {
  assertAdminCallable,
  getAdminStripe,
  isStripeLiveMode,
  pickPrimaryBalanceAmount,
} from "./adminStripeAuth.js";

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMs(): number {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonthMs(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function paidAtMs(data: Record<string, unknown>): number | null {
  const paidAt = data.paidAt;
  if (paidAt && typeof paidAt === "object" && "toMillis" in paidAt) {
    const ms = (paidAt as {toMillis: () => number}).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  const createdAt = data.createdAt;
  if (createdAt && typeof createdAt === "object" && "toMillis" in createdAt) {
    const ms = (createdAt as {toMillis: () => number}).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function normStatus(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "paid" || s === "succeeded") return "paid";
  if (s === "refunded") return "refunded";
  if (s === "failed") return "failed";
  if (s === "disputed") return "disputed";
  return "pending";
}

async function aggregatePaymentMetrics(): Promise<{
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  lifetimeRevenue: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
  refundedPayments: number;
}> {
  const snap = await admin.firestore().collection("paymentTransactions").get();
  const todayStart = startOfTodayMs();
  const weekStart = startOfWeekMs();
  const monthStart = startOfMonthMs();

  let todayRevenue = 0;
  let weekRevenue = 0;
  let monthRevenue = 0;
  let lifetimeRevenue = 0;
  let successfulPayments = 0;
  let pendingPayments = 0;
  let failedPayments = 0;
  let refundedPayments = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const status = normStatus(data.status ?? data.paymentStatus);
    const amount = typeof data.amount === "number" ? data.amount : 0;
    const ms = paidAtMs(data);

    if (status === "paid") {
      successfulPayments += 1;
      lifetimeRevenue += amount;
      if (ms != null) {
        if (ms >= todayStart) todayRevenue += amount;
        if (ms >= weekStart) weekRevenue += amount;
        if (ms >= monthStart) monthRevenue += amount;
      }
    } else if (status === "pending") {
      pendingPayments += 1;
    } else if (status === "failed") {
      failedPayments += 1;
    } else if (status === "refunded") {
      refundedPayments += 1;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    todayRevenue: round(todayRevenue),
    weekRevenue: round(weekRevenue),
    monthRevenue: round(monthRevenue),
    lifetimeRevenue: round(lifetimeRevenue),
    successfulPayments,
    pendingPayments,
    failedPayments,
    refundedPayments,
  };
}

export type StripeTreasurySummaryPayload = {
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  lifetimeRevenue: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
  refundedPayments: number;
  fetchedAtMs: number;
};

export async function buildStripeTreasurySummary(): Promise<StripeTreasurySummaryPayload> {
  const stripe = getAdminStripe();
  const [balance, metrics] = await Promise.all([
    stripe.balance.retrieve(),
    aggregatePaymentMetrics(),
  ]);
  const available = pickPrimaryBalanceAmount(balance.available);
  const pending = pickPrimaryBalanceAmount(balance.pending, available.currency);

  return {
    availableBalance: available.amount,
    pendingBalance: pending.amount,
    currency: available.currency,
    ...metrics,
    fetchedAtMs: Date.now(),
  };
}

export type StripeAccountDiagnosticsPayload = {
  stripeAccountConnected: boolean;
  liveMode: boolean;
  bankAccountConnected: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  accountId: string | null;
  defaultCurrency: string | null;
  country: string | null;
  warnings: string[];
  fetchedAtMs: number;
};

export async function buildStripeAccountDiagnostics(): Promise<StripeAccountDiagnosticsPayload> {
  const stripe = getAdminStripe();
  const warnings: string[] = [];
  let stripeAccountConnected = false;
  let bankAccountConnected = false;
  let payoutsEnabled = false;
  let chargesEnabled = false;
  let accountId: string | null = null;
  let defaultCurrency: string | null = null;
  let country: string | null = null;

  try {
    await stripe.balance.retrieve();
    stripeAccountConnected = true;
  } catch {
    warnings.push("Could not reach Stripe with STRIPE_SECRET_KEY.");
  }

  try {
    const account = await stripe.accounts.retrieve();
    accountId = account.id ?? null;
    defaultCurrency = account.default_currency?.toLowerCase() ?? null;
    country = account.country ?? null;
    payoutsEnabled = account.payouts_enabled === true;
    chargesEnabled = account.charges_enabled === true;

    if (!payoutsEnabled) {
      warnings.push("Stripe payouts are not enabled on this account.");
    }
    if (!chargesEnabled) {
      warnings.push("Stripe charges are not enabled on this account.");
    }

    if (accountId) {
      const banks = await stripe.accounts.listExternalAccounts(accountId, {
        object: "bank_account",
        limit: 1,
      });
      bankAccountConnected = banks.data.length > 0;
      if (!bankAccountConnected) {
        warnings.push("No bank account linked for payouts.");
      }
    }
  } catch (err) {
    warnings.push(
      err instanceof Error
        ? `Account diagnostics partial: ${err.message}`
        : "Could not load full Stripe account settings.",
    );
  }

  const liveMode = isStripeLiveMode();
  if (!liveMode) {
    warnings.push("Stripe is in test mode (sk_test_ key).");
  }

  return {
    stripeAccountConnected,
    liveMode,
    bankAccountConnected,
    payoutsEnabled,
    chargesEnabled,
    accountId,
    defaultCurrency,
    country,
    warnings,
    fetchedAtMs: Date.now(),
  };
}

/** Admin-only — Stripe balance + payment ledger revenue summary. */
export const getStripeTreasurySummary = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (_data: unknown, context: CallableContext) => {
    await assertAdminCallable(context);
    try {
      const payload = await buildStripeTreasurySummary();
      console.log("[STRIPE TREASURY SUMMARY]", {
        availableBalance: payload.availableBalance,
        lifetimeRevenue: payload.lifetimeRevenue,
        successfulPayments: payload.successfulPayments,
      });
      return payload;
    } catch (error) {
      console.error("[STRIPE TREASURY SUMMARY ERROR]", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Could not load treasury summary.",
      );
    }
  });

/** Admin-only — Stripe account setup diagnostics. */
export const getStripeAccountDiagnostics = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (_data: unknown, context: CallableContext) => {
    await assertAdminCallable(context);
    try {
      const payload = await buildStripeAccountDiagnostics();
      console.log("[STRIPE ACCOUNT DIAGNOSTICS]", {
        connected: payload.stripeAccountConnected,
        liveMode: payload.liveMode,
        warningCount: payload.warnings.length,
      });
      return payload;
    } catch (error) {
      console.error("[STRIPE ACCOUNT DIAGNOSTICS ERROR]", error);
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error
          ? error.message
          : "Could not load Stripe account diagnostics.",
      );
    }
  });
