import * as admin from "firebase-admin";
import type {CallableContext} from "firebase-functions/v1/https";
import * as functions from "firebase-functions/v1";
import {defineSecret} from "firebase-functions/params";
import Stripe from "stripe";

const stripeSecret = defineSecret("STRIPE_SECRET_KEY");

const ADMIN_EMAILS = new Set([
  "admin@ourfood.com",
  "ryadh1409@gmail.com",
  "support@halforder.app",
]);

const ADMIN_UIDS = new Set([
  "KT3LfXRsVgaH4LfRTQaexvj3CRn1",
  "Gjj6x4OU4OQmsnplollo9PLLpxt2",
]);

let stripeSingleton: Stripe | null = null;

export function getAdminStripe(): Stripe {
  const key = stripeSecret.value();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {apiVersion: "2025-02-24.acacia"});
  }
  return stripeSingleton;
}

export function isStripeLiveMode(): boolean {
  const key = stripeSecret.value() || process.env.STRIPE_SECRET_KEY || "";
  return key.startsWith("sk_live_");
}

export async function assertAdminCallable(context: CallableContext): Promise<string> {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }
  const uid = context.auth.uid;
  const token = context.auth.token as Record<string, unknown>;
  if (token.admin === true || token.role === "admin") return uid;

  const email =
    typeof token.email === "string" ? token.email.trim().toLowerCase() : "";
  if (email && ADMIN_EMAILS.has(email)) return uid;
  if (ADMIN_UIDS.has(uid)) return uid;

  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  if (userSnap.data()?.role === "admin") return uid;

  throw new functions.https.HttpsError(
    "permission-denied",
    "Admin access required.",
  );
}

export function centsToMajor(cents: number): number {
  return Math.round(cents) / 100;
}

export function pickPrimaryBalanceAmount(
  entries: Stripe.Balance.Available[] | Stripe.Balance.Pending[] | null | undefined,
  preferredCurrency = "cad",
): {amount: number; currency: string} {
  if (!entries?.length) return {amount: 0, currency: preferredCurrency};
  const preferred = entries.find(
    (row) => row.currency.toLowerCase() === preferredCurrency,
  );
  const row = preferred ?? entries[0];
  return {amount: centsToMajor(row.amount), currency: row.currency.toLowerCase()};
}
