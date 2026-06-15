import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import type Stripe from "stripe";
import {
  assertAdminCallable,
  centsToMajor,
  getAdminStripe,
  pickPrimaryBalanceAmount,
} from "./adminStripeAuth.js";
import * as admin from "firebase-admin";

function formatBankAccount(
  destination: Stripe.ExternalAccount | Stripe.DeletedExternalAccount | string | null | undefined,
): string {
  if (!destination || typeof destination === "string") return "Bank account";
  if ("deleted" in destination && destination.deleted) return "Bank account (removed)";
  if (destination.object === "bank_account") {
    const bank = destination as Stripe.BankAccount;
    const name = bank.bank_name?.trim() || "Bank";
    const last4 = bank.last4?.trim() || "????";
    return `${name} **** ${last4}`;
  }
  if (destination.object === "card") {
    const card = destination as Stripe.Card;
    const brand = card.brand
      ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1)
      : "Card";
    return `${brand} **** ${card.last4 ?? "????"}`;
  }
  return "Bank account";
}

function payoutStatusLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "in_transit":
      return "In transit";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    default:
      return status;
  }
}

async function sumLifetimeRevenue(): Promise<number> {
  const snap = await admin.firestore().collection("paymentTransactions").get();
  let total = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const status = String(data.status ?? data.paymentStatus ?? "").toLowerCase();
    if (status !== "paid") continue;
    if (typeof data.amount === "number") total += data.amount;
  }
  return Math.round(total * 100) / 100;
}

export type AdminStripePayoutRow = {
  id: string;
  createdMs: number | null;
  arrivalMs: number | null;
  amount: number;
  currency: string;
  status: string;
  statusLabel: string;
  bankAccount: string;
};

export type AdminStripePayoutsPayload = {
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  lifetimeRevenue: number;
  nextPayoutDateMs: number | null;
  nextPayoutAmount: number | null;
  nextPayoutCurrency: string | null;
  recentPayouts: AdminStripePayoutRow[];
  fetchedAtMs: number;
};

export async function buildAdminStripePayoutsPayload(): Promise<AdminStripePayoutsPayload> {
  const stripe = getAdminStripe();
  const [balance, payouts, lifetimeRevenue] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.payouts.list({limit: 25, expand: ["data.destination"]}),
    sumLifetimeRevenue(),
  ]);

  const available = pickPrimaryBalanceAmount(balance.available);
  const pending = pickPrimaryBalanceAmount(balance.pending, available.currency);

  const recentPayouts: AdminStripePayoutRow[] = payouts.data.map((payout) => ({
    id: payout.id,
    createdMs: payout.created ? payout.created * 1000 : null,
    arrivalMs: payout.arrival_date ? payout.arrival_date * 1000 : null,
    amount: centsToMajor(payout.amount),
    currency: payout.currency.toLowerCase(),
    status: payout.status,
    statusLabel: payoutStatusLabel(payout.status),
    bankAccount: formatBankAccount(payout.destination),
  }));

  const upcoming = payouts.data
    .filter((p) => p.status === "pending" || p.status === "in_transit")
    .sort((a, b) => (a.arrival_date ?? 0) - (b.arrival_date ?? 0))[0];

  return {
    availableBalance: available.amount,
    pendingBalance: pending.amount,
    currency: available.currency,
    lifetimeRevenue,
    nextPayoutDateMs: upcoming?.arrival_date ? upcoming.arrival_date * 1000 : null,
    nextPayoutAmount: upcoming ? centsToMajor(upcoming.amount) : null,
    nextPayoutCurrency: upcoming?.currency.toLowerCase() ?? null,
    recentPayouts,
    fetchedAtMs: Date.now(),
  };
}

/** Admin-only — live Stripe balance + payout history for Finance → Payouts. */
export const getAdminStripePayouts = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (_data: unknown, context: CallableContext) => {
    await assertAdminCallable(context);
    try {
      const payload = await buildAdminStripePayoutsPayload();
      console.log("[ADMIN STRIPE PAYOUTS]", {
        availableBalance: payload.availableBalance,
        pendingBalance: payload.pendingBalance,
        lifetimeRevenue: payload.lifetimeRevenue,
        payoutCount: payload.recentPayouts.length,
      });
      return payload;
    } catch (error) {
      console.error("[ADMIN STRIPE PAYOUTS ERROR]", {
        message: error instanceof Error ? error.message : String(error),
        error,
      });
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Could not load Stripe payouts.",
      );
    }
  });
