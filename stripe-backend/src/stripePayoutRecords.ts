import * as admin from "firebase-admin";
import type Stripe from "stripe";

const COLLECTION = "stripePayoutRecords";

function db() {
  return admin.firestore();
}

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

export async function upsertStripePayoutRecord(input: {
  payout: Stripe.Payout;
  eventType: string;
}): Promise<void> {
  const {payout, eventType} = input;
  const ref = db().collection(COLLECTION).doc(payout.id);
  const existing = await ref.get();
  const payload: Record<string, unknown> = {
    id: payout.id,
    stripePayoutId: payout.id,
    amount: payout.amount / 100,
    currency: payout.currency.toLowerCase(),
    status: payout.status,
    arrivalDate: payout.arrival_date
      ? admin.firestore.Timestamp.fromMillis(payout.arrival_date * 1000)
      : null,
    createdDate: payout.created
      ? admin.firestore.Timestamp.fromMillis(payout.created * 1000)
      : null,
    bankAccount: formatBankAccount(payout.destination),
    stripeWebhookLastEventType: eventType,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!existing.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await ref.set(payload, {merge: true});
}
