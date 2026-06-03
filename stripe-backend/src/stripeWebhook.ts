/**
 * Stripe webhook — Firebase Functions **v2** HTTPS (raw body preserved for signature verification).
 */
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import type { DocumentSnapshot, Transaction } from "firebase-admin/firestore";
import Stripe from "stripe";
import { paymentIntentIdFromSession, trimMetadata } from "./stripeWebhookLogic.js";
import {
  buildOrderPaidStatePatch,
  needsPaidStatusRepair,
  orderPaymentStatusString,
  orderStatusString,
} from "./orderPaidState.js";

const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

const PROCESSED_EVENTS = "stripe_processed_events";

function resolveBoundSecret(
  param: { value: () => string },
  envName: string,
): string | null {
  try {
    const fromParam = param.value();
    if (typeof fromParam === "string" && fromParam.trim()) {
      return fromParam.trim();
    }
  } catch {
    // Param may be unavailable in some local/emulator paths; fall through to env.
  }
  const fromEnv = process.env[envName];
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return null;
}

let stripeSingleton: Stripe | null = null;

function getStripe(): Stripe {
  const key = resolveBoundSecret(stripeSecretKey, "STRIPE_SECRET_KEY");
  if (!key) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY — run: firebase functions:secrets:set STRIPE_SECRET_KEY && redeploy stripeWebhook",
    );
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: "2023-10-16" as Stripe.LatestApiVersion,
    });
  }
  return stripeSingleton;
}

function logStripe(structLog: Record<string, unknown>): void {
  console.log("[stripeWebhook]", JSON.stringify(structLog));
}

function logStripeDebug(stage: string, payload: Record<string, unknown>): void {
  console.log(`[stripeWebhook][DEBUG] ${stage}`, JSON.stringify(payload));
}

/**
 * Idempotent Stripe event handling — Firestore requires every read before any write in a transaction.
 */
async function withEventIdempotency(
  event: Stripe.Event,
  orderId: string,
  apply: (tx: Transaction, orderSnap: DocumentSnapshot) => void,
): Promise<"duplicate" | "applied"> {
  const db = admin.firestore();
  const evRef = db.collection(PROCESSED_EVENTS).doc(event.id);
  const orderRef = db.doc(`orders/${orderId}`);
  let duplicate = false;

  await db.runTransaction(async (tx) => {
    const [existing, orderSnap] = await Promise.all([tx.get(evRef), tx.get(orderRef)]);

    if (existing.exists) {
      duplicate = true;
      return;
    }

    tx.set(evRef, {
      stripeEventId: event.id,
      type: event.type,
      livemode: event.livemode,
      apiVersion: event.api_version ?? null,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    apply(tx, orderSnap);
  });

  return duplicate ? "duplicate" : "applied";
}

function mergeOrderPaidSync(
  tx: Transaction,
  orderSnap: DocumentSnapshot,
  params: {
    orderId: string;
    paymentIntentId: string | null;
    checkoutSessionId: string | null;
    sourceEventType: string;
    stripeEventId: string;
  },
): void {
  const { orderId, paymentIntentId, checkoutSessionId, sourceEventType, stripeEventId } =
    params;
  if (!orderSnap.exists) {
    logStripeDebug("order_missing_in_tx", { orderId, stripeEventId });
    return;
  }
  const data = orderSnap.data() ?? {};
  const before = {
    paymentStatus: orderPaymentStatusString(data.paymentStatus),
    status: orderStatusString(data.status),
  };

  const alreadyPaid = before.paymentStatus === "paid";
  const needsRepair = needsPaidStatusRepair(data);
  const currentStage = orderStatusString(data.status);
  const courierStage = orderStatusString(data.deliveryStatus).toLowerCase();
  const fulfillmentAdvanced =
    currentStage === "accepted" ||
    currentStage === "restaurant_accepted" ||
    currentStage === "preparing" ||
    currentStage === "ready" ||
    currentStage === "ready_for_pickup" ||
    courierStage === "accepted" ||
    courierStage === "preparing" ||
    courierStage === "ready_for_pickup" ||
    courierStage === "driver_assigned" ||
    courierStage === "picked_up" ||
    courierStage === "delivered";

  if (alreadyPaid && !needsRepair) {
    logStripeDebug("order_already_paid_skip_order_patch", {
      orderId,
      stripeEventId,
      sourceEventType,
      before,
    });
    return;
  }

  if (fulfillmentAdvanced) {
    logStripeDebug("order_paid_skip_fulfillment_advanced", {
      orderId,
      stripeEventId,
      sourceEventType,
      before,
    });
    return;
  }

  logStripeDebug("order_paid_update_before", {
    orderId,
    stripeEventId,
    sourceEventType,
    before,
    repairOnly: alreadyPaid && needsRepair,
  });

  const basePatch = buildOrderPaidStatePatch(data, {
    paymentIntentId,
    checkoutSessionId,
    stripeWebhookLastEventType: sourceEventType,
    stripeWebhookLastEventId: stripeEventId,
    repairOnly: alreadyPaid && needsRepair,
  });

  const patch: Record<string, unknown> = {
    ...basePatch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!alreadyPaid) {
    patch.paidAt = admin.firestore.FieldValue.serverTimestamp();
  }

  console.log("[ORDER WRITE TRACE]", "stripeWebhook.ts", "mergeOrderPaidSync", {
    orderId,
    status: patch.status ?? null,
    deliveryStatus: patch.deliveryStatus ?? null,
    paymentStatus: patch.paymentStatus ?? null,
    op: "set",
    merge: true,
  });

  tx.set(orderSnap.ref, patch, { merge: true });

  logStripeDebug("order_paid_update_after", {
    orderId,
    stripeEventId,
    sourceEventType,
    before,
    after: {
      paymentStatus: patch.paymentStatus,
      status: patch.status,
      deliveryStatus: patch.deliveryStatus,
    },
  });
}

function mergeOrderPaymentFailed(
  tx: Transaction,
  orderSnap: DocumentSnapshot,
  params: {
    paymentIntentId: string | null;
    sourceEventType: string;
    stripeEventId: string;
  },
): void {
  const { paymentIntentId, sourceEventType, stripeEventId } = params;
  if (!orderSnap.exists) return;
  const data = orderSnap.data() ?? {};
  if (data.paymentStatus === "paid") {
    logStripeDebug("payment_failed_ignored_already_paid", { stripeEventId });
    return;
  }

  const patch: Record<string, unknown> = {
    paymentStatus: "failed",
    status: "payment_failed",
    paymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
    stripeWebhookLastEventType: sourceEventType,
    stripeWebhookLastEventId: stripeEventId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (paymentIntentId) {
    patch.lastFailedPaymentIntentId = paymentIntentId;
    patch.paymentIntentId = paymentIntentId;
    patch.stripePaymentIntentId = paymentIntentId;
  }

  console.log("[ORDER WRITE TRACE]", "stripeWebhook.ts", "mergeOrderPaymentFailed", {
    orderId: orderSnap.id,
    status: patch.status ?? null,
    deliveryStatus: patch.deliveryStatus ?? null,
    paymentStatus: patch.paymentStatus ?? null,
    op: "set",
    merge: true,
  });

  tx.set(orderSnap.ref, patch, { merge: true });
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  logStripeDebug("event_dispatch", {
    type: event.type,
    id: event.id,
    livemode: event.livemode,
    apiVersion: event.api_version ?? null,
  });

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = trimMetadata(pi.metadata?.orderId);
      logStripeDebug("payment_intent_succeeded", {
        paymentIntentId: pi.id,
        orderId,
        hasMetadata: Boolean(pi.metadata && Object.keys(pi.metadata).length > 0),
      });
      if (!orderId) {
        logStripe({
          level: "info",
          msg: "payment_intent.succeeded_no_order_id",
          stripeEventId: event.id,
        });
        return;
      }

      const outcome = await withEventIdempotency(event, orderId, (tx, orderSnap) => {
        mergeOrderPaidSync(tx, orderSnap, {
          orderId,
          paymentIntentId: pi.id,
          checkoutSessionId: null,
          sourceEventType: event.type,
          stripeEventId: event.id,
        });
      });

      logStripe({
        level: "info",
        msg: "payment_intent_succeeded_handled",
        outcome,
        orderId,
        paymentIntentId: pi.id,
        stripeEventId: event.id,
      });
      return;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = trimMetadata(session.metadata?.orderId);
      const stripePaymentIntentId = paymentIntentIdFromSession(session);

      logStripeDebug("checkout_session_completed", {
        sessionId: session.id,
        orderId,
        stripePaymentIntentId,
        paymentStatus: session.payment_status,
      });

      if (!orderId) {
        logStripe({
          level: "info",
          msg: "checkout_session_completed_no_order_id",
          stripeEventId: event.id,
        });
        return;
      }

      const outcome = await withEventIdempotency(event, orderId, (tx, orderSnap) => {
        mergeOrderPaidSync(tx, orderSnap, {
          orderId,
          paymentIntentId: stripePaymentIntentId,
          checkoutSessionId: session.id,
          sourceEventType: event.type,
          stripeEventId: event.id,
        });
      });

      logStripe({
        level: "info",
        msg: "checkout_session_completed_handled",
        outcome,
        orderId,
        sessionId: session.id,
        stripeEventId: event.id,
      });
      return;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = trimMetadata(pi.metadata?.orderId);
      logStripeDebug("payment_intent_payment_failed", {
        paymentIntentId: pi.id,
        orderId,
      });
      if (!orderId) {
        logStripe({
          level: "info",
          msg: "payment_failed_no_order_id",
          stripeEventId: event.id,
        });
        return;
      }

      const outcome = await withEventIdempotency(event, orderId, (tx, orderSnap) => {
        mergeOrderPaymentFailed(tx, orderSnap, {
          paymentIntentId: pi.id,
          sourceEventType: event.type,
          stripeEventId: event.id,
        });
      });

      logStripe({
        level: "info",
        msg: "payment_intent_payment_failed_handled",
        outcome,
        orderId,
        paymentIntentId: pi.id,
        stripeEventId: event.id,
      });
      return;
    }

    default:
      logStripe({
        level: "info",
        msg: "event_ignored",
        type: event.type,
        stripeEventId: event.id,
      });
  }
}

export const stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [stripeWebhookSecret, stripeSecretKey],
    cors: false,
    invoker: "public",
    maxInstances: 20,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    const requestId =
      typeof req.headers["x-cloud-trace-context"] === "string"
        ? req.headers["x-cloud-trace-context"].split("/")[0]
        : undefined;

    try {
      if (req.method !== "POST") {
        logStripe({ level: "warn", msg: "method_not_allowed", method: req.method, requestId });
        res.status(405).set("Allow", "POST").send("Method Not Allowed");
        return;
      }

      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        logStripe({ level: "warn", msg: "missing_signature", requestId });
        res.status(400).send("Missing stripe-signature header");
        return;
      }

      const rawBody = req.rawBody;
      if (!Buffer.isBuffer(rawBody)) {
        logStripe({
          level: "error",
          msg: "raw_body_not_buffer",
          requestId,
          bodyType: typeof rawBody,
        });
        res.status(500).send("Webhook misconfiguration: raw body unavailable");
        return;
      }

      const webhookSigningSecret = resolveBoundSecret(
        stripeWebhookSecret,
        "STRIPE_WEBHOOK_SECRET",
      );

      if (!webhookSigningSecret) {
        logStripe({
          level: "error",
          msg: "webhook_secret_missing",
          requestId,
        });
        res.status(500).send("Webhook secret not configured");
        return;
      }

      let event: Stripe.Event;
      try {
        event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSigningSecret);
      } catch (verifyErr) {
        const message = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        logStripe({
          level: "warn",
          msg: "signature_verify_failed",
          message,
          requestId,
          rawBodyLength: rawBody.length,
        });
        res.status(400).send(`Webhook signature verification failed: ${message}`);
        return;
      }

      logStripe({
        level: "info",
        msg: "event_verified",
        stripeEventId: event.id,
        type: event.type,
        livemode: event.livemode,
        requestId,
      });

      try {
        await handleStripeEvent(event);
      } catch (handlerErr) {
        logStripe({
          level: "error",
          msg: "handler_threw",
          stripeEventId: event.id,
          type: event.type,
          error: handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
          stack: handlerErr instanceof Error ? handlerErr.stack : undefined,
        });
        res.status(500).json({ error: "Webhook handler failed" });
        return;
      }

      logStripe({
        level: "info",
        msg: "webhook_received",
        type: event.type,
        stripeEventId: event.id,
      });

      logStripe({
        level: "info",
        msg: "webhook_success",
        type: event.type,
        stripeEventId: event.id,
      });

      res.status(200).json({ received: true });
    } catch (fatalErr) {
      logStripe({
        level: "error",
        msg: "fatal",
        error: fatalErr instanceof Error ? fatalErr.message : String(fatalErr),
        stack: fatalErr instanceof Error ? fatalErr.stack : undefined,
        requestId,
      });
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
