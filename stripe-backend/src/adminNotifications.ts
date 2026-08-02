/**
 * Admin real-time email notifications.
 *
 * 1. onNewUserSignUp  — fires when a new user creates an account
 * 2. onPaymentCompleted — fires when an order's paymentStatus becomes 'paid'
 *
 * Both send an instant email to the admin: ryadh1409@gmail.com
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import nodemailer from "nodemailer";

const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

const ADMIN_EMAIL = "ryadh1409@gmail.com";
const GMAIL_USER  = "ryadh1409@gmail.com";
const APP_NAME    = "HalfOrder";

// ── Mailer ────────────────────────────────────────────────────────────────────

function makeTransport(password: string) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: password },
  });
}

function now(): string {
  return new Date().toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── 1. New user sign-up ───────────────────────────────────────────────────────

export const onNewUserSignUp = functions
  .runWith({ secrets: ["GMAIL_APP_PASSWORD"] })
  .auth.user()
  .onCreate(async (user) => {
    const name  = user.displayName ?? "—";
    const email = user.email ?? "—";
    const uid   = user.uid;
    const time  = now();
    const provider = user.providerData?.[0]?.providerId ?? "unknown";

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;background:#f9fafb;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#7C3AED;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:20px;">👤 New User Signed Up</h2>
          <p style="color:#DDD6FE;margin:4px 0 0;font-size:13px;">${APP_NAME} · ${time}</p>
        </div>
        <div style="padding:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;width:120px;">Name</td><td style="padding:8px 0;font-weight:700;color:#111827;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Email</td><td style="padding:8px 0;font-weight:700;color:#111827;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">UID</td><td style="padding:8px 0;color:#374151;font-family:monospace;font-size:12px;">${uid}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Provider</td><td style="padding:8px 0;color:#374151;">${provider}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Time</td><td style="padding:8px 0;color:#374151;">${time}</td></tr>
          </table>
        </div>
        <div style="background:#F3F4F6;padding:12px 24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">${APP_NAME} Admin · Auto-generated notification</p>
        </div>
      </div>
    `;

    try {
      const transport = makeTransport(gmailAppPassword.value());
      await transport.sendMail({
        from: `"${APP_NAME} Admin" <${GMAIL_USER}>`,
        to: ADMIN_EMAIL,
        subject: `👤 New user: ${name || email}`,
        html,
      });
      functions.logger.info("onNewUserSignUp: email sent", { uid, email });
    } catch (err) {
      functions.logger.error("onNewUserSignUp: email failed", err);
    }
  });

// ── 2. Payment completed ──────────────────────────────────────────────────────

export const onPaymentCompleted = functions
  .runWith({ secrets: ["GMAIL_APP_PASSWORD"] })
  .firestore.document("orders/{orderId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? (change.before.data() as Record<string, unknown>) : null;
    const after  = change.after.exists  ? (change.after.data()  as Record<string, unknown>) : null;

    if (!after) return; // deleted

    const paymentAfter  = typeof after.paymentStatus === "string"  ? after.paymentStatus  : "";
    const paymentBefore = before && typeof before.paymentStatus === "string" ? before.paymentStatus : "";

    // Only fire when paymentStatus transitions TO paid/succeeded
    const isPaid = paymentAfter === "paid" || paymentAfter === "succeeded";
    const wasPaid = paymentBefore === "paid" || paymentBefore === "succeeded";
    if (!isPaid || wasPaid) return;

    const orderId    = context.params.orderId as string;
    const userId     = typeof after.userId === "string" ? after.userId : "—";
    const total      = typeof after.total === "number" ? `$${after.total.toFixed(2)}` :
                       typeof after.grandTotal === "number" ? `$${after.grandTotal.toFixed(2)}` : "—";
    const restaurant = typeof after.restaurantName === "string" ? after.restaurantName :
                       (after.restaurant as Record<string, unknown>)?.name ?? "—";
    const method     = typeof after.paymentMethod === "string" ? after.paymentMethod : "Card";
    const fulfillment = typeof after.fulfillmentMode === "string" ? after.fulfillmentMode : "delivery";
    const time        = now();

    // Try to fetch user email from Firestore
    let userEmail = "—";
    let userName  = "—";
    try {
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      const u = userDoc.data() as Record<string, unknown> | undefined;
      if (u) {
        userEmail = typeof u.email === "string" ? u.email : "—";
        userName  = typeof u.displayName === "string" ? u.displayName :
                    typeof u.name === "string" ? u.name : "—";
      }
    } catch {
      // non-fatal
    }

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;background:#f9fafb;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#16A34A;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:20px;">💳 Payment Received</h2>
          <p style="color:#BBF7D0;margin:4px 0 0;font-size:13px;">${APP_NAME} · ${time}</p>
        </div>
        <div style="padding:24px;">
          <div style="background:#ECFDF5;border-radius:10px;padding:14px 18px;margin-bottom:20px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#166534;">Total charged</p>
            <p style="margin:4px 0 0;font-size:32px;font-weight:900;color:#15803D;">${total}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;width:140px;">Order ID</td><td style="padding:8px 0;color:#374151;font-family:monospace;font-size:12px;">${orderId}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Customer</td><td style="padding:8px 0;font-weight:700;color:#111827;">${userName}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Customer email</td><td style="padding:8px 0;color:#374151;">${userEmail}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Restaurant</td><td style="padding:8px 0;font-weight:700;color:#111827;">${String(restaurant)}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Payment method</td><td style="padding:8px 0;color:#374151;">${method}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Fulfillment</td><td style="padding:8px 0;color:#374151;">${fulfillment}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;">Time</td><td style="padding:8px 0;color:#374151;">${time}</td></tr>
          </table>
        </div>
        <div style="background:#F3F4F6;padding:12px 24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">${APP_NAME} Admin · Auto-generated notification</p>
        </div>
      </div>
    `;

    try {
      const transport = makeTransport(gmailAppPassword.value());
      await transport.sendMail({
        from: `"${APP_NAME} Admin" <${GMAIL_USER}>`,
        to: ADMIN_EMAIL,
        subject: `💳 Payment ${total} — ${String(restaurant)}`,
        html,
      });
      functions.logger.info("onPaymentCompleted: email sent", { orderId, total });
    } catch (err) {
      functions.logger.error("onPaymentCompleted: email failed", err);
    }
  });
