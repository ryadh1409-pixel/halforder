/**
 * Stripe webhook — Firebase Functions **v2** HTTPS (raw body preserved for signature verification).
 */
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";

const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

/**
 * Resolve a Firebase-defined secret for Functions v2:
 * 1) `defineSecret(...).value()` when the param runtime is wired (preferred).
 * 2) `process.env.<NAME>` — Cloud Functions also injects bound secrets as env vars.
 */
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

function logStripeDebug(stage: string, payload: Record<string, unknown>): void {
  console.log(`[stripeWebhook][DEBUG] ${stage}`, JSON.stringify(payload));
}

async function markOrderPaidFromStripe(params: {
  orderId: string;
  stripePaymentIntentId?: string | null;
  sourceEventType: string;
  stripeEventId: string;
}): Promise<void> {
  const { orderId, stripePaymentIntentId, sourceEventType, stripeEventId } = params;
  const ref = admin.firestore().doc(`orders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    logStripeDebug("order_missing", {
      orderId,
      sourceEventType,
      stripeEventId,
    });
    return;
  }

  const existing = snap.data() ?? {};
  if (existing.paymentStatus === "paid") {
    logStripeDebug("order_already_paid_skip", {
      orderId,
      sourceEventType,
      stripeEventId,
    });
    return;
  }

  await ref.set(
    {
      paymentStatus: "paid",
      ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
      status: "pending_driver",
      deliveryStatus: "waiting_driver",
      stripeWebhookLastEventType: sourceEventType,
      stripeWebhookLastEventId: stripeEventId,
      paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log("[stripeWebhook] Firestore order marked paid", {
    orderId,
    stripePaymentIntentId: stripePaymentIntentId ?? null,
    sourceEventType,
    stripeEventId,
  });
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
      const orderId =
        typeof pi.metadata?.orderId === "string" && pi.metadata.orderId.trim()
          ? pi.metadata.orderId.trim()
          : null;
      logStripeDebug("payment_intent_succeeded", {
        paymentIntentId: pi.id,
        orderId,
        hasMetadata: Boolean(pi.metadata && Object.keys(pi.metadata).length > 0),
      });
      if (!orderId) {
        console.log(
          "[stripeWebhook] payment_intent.succeeded: no orderId in metadata — acknowledging (test events ok)",
        );
        return;
      }
      await markOrderPaidFromStripe({
        orderId,
        stripePaymentIntentId: pi.id,
        sourceEventType: event.type,
        stripeEventId: event.id,
      });
      return;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId =
        typeof session.metadata?.orderId === "string" && session.metadata.orderId.trim()
          ? session.metadata.orderId.trim()
          : null;
      const piRaw = session.payment_intent;
      const stripePaymentIntentId =
        typeof piRaw === "string" ? piRaw : piRaw && typeof piRaw === "object" && "id" in piRaw
          ? String((piRaw as { id: string }).id)
          : null;

      logStripeDebug("checkout_session_completed", {
        sessionId: session.id,
        orderId,
        stripePaymentIntentId,
        paymentStatus: session.payment_status,
      });

      if (!orderId) {
        console.log(
          "[stripeWebhook] checkout.session.completed: no orderId in metadata — acknowledging",
        );
        return;
      }

      await markOrderPaidFromStripe({
        orderId,
        stripePaymentIntentId,
        sourceEventType: event.type,
        stripeEventId: event.id,
      });
      return;
    }

    default:
      console.log("[stripeWebhook] Ignoring unhandled event type", {
        type: event.type,
        id: event.id,
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
        console.log("[stripeWebhook] Method not allowed", { method: req.method, requestId });
        res.status(405).set("Allow", "POST").send("Method Not Allowed");
        return;
      }

      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        console.warn("[stripeWebhook] Missing Stripe-Signature header", { requestId });
        res.status(400).send("Missing stripe-signature header");
        return;
      }

      const rawBody = req.rawBody;
      if (!Buffer.isBuffer(rawBody)) {
        console.error("[stripeWebhook] req.rawBody is not a Buffer — cannot verify signature", {
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
        console.error("[stripeWebhook] STRIPE_WEBHOOK_SECRET not configured or not mounted", {
          fixSetSecret: "firebase functions:secrets:set STRIPE_WEBHOOK_SECRET",
          fixGrantAccess: "firebase functions:secrets:grantaccess STRIPE_WEBHOOK_SECRET",
          fixRedeploy: "firebase deploy --only functions:functions:stripeWebhook",
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
        console.warn("[stripeWebhook] Signature verification failed", {
          message,
          requestId,
          rawBodyLength: rawBody.length,
        });
        res.status(400).send(`Webhook signature verification failed: ${message}`);
        return;
      }

      console.log("[stripeWebhook] Verified event", {
        id: event.id,
        type: event.type,
        livemode: event.livemode,
        requestId,
      });

      try {
        await handleStripeEvent(event);
      } catch (handlerErr) {
        console.error("[stripeWebhook] Handler threw — returning 500 for Stripe retry", {
          eventId: event.id,
          eventType: event.type,
          error: handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
          stack: handlerErr instanceof Error ? handlerErr.stack : undefined,
        });
        res.status(500).json({ error: "Webhook handler failed" });
        return;
      }

      res.status(200).json({ received: true });
    } catch (fatalErr) {
      console.error("[stripeWebhook] Fatal error", {
        error: fatalErr instanceof Error ? fatalErr.message : String(fatalErr),
        stack: fatalErr instanceof Error ? fatalErr.stack : undefined,
        requestId,
      });
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
