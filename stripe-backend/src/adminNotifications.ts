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

// ── Expo Push ─────────────────────────────────────────────────────────────────

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    to: token,
    title,
    body,
    sound: "default",
    priority: "high",
    channelId: "default",
  };
  if (data) payload.data = data;

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([payload]),
    });
    const json = (await res.json()) as { data?: Array<{ status?: string; message?: string }> };
    const ticket = json.data?.[0];
    if (ticket?.status === "error") {
      functions.logger.warn("sendExpoPush: ticket error", ticket.message);
    } else {
      functions.logger.info("sendExpoPush: sent", { title, token: token.slice(0, 20) });
    }
  } catch (err) {
    functions.logger.error("sendExpoPush: fetch failed", err);
  }
}

/** Fetch all Expo push tokens for users with role=admin. */
async function getAdminPushTokens(): Promise<string[]> {
  const snap = await admin.firestore()
    .collection("users")
    .where("role", "==", "admin")
    .get();

  const tokens: string[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const token =
      typeof data.expoPushToken === "string" ? data.expoPushToken.trim() :
      typeof data.pushToken === "string" ? data.pushToken.trim() : "";
    if (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) {
      tokens.push(token);
    }
  }
  return tokens;
}

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

    const orderId     = context.params.orderId as string;
    const userId      = typeof after.userId === "string" ? after.userId : "—";
    const total       = typeof after.total === "number" ? `$${after.total.toFixed(2)}` :
                        typeof after.grandTotal === "number" ? `$${after.grandTotal.toFixed(2)}` : "—";
    const subtotal    = typeof after.subtotal === "number" ? `$${after.subtotal.toFixed(2)}` : "—";
    const deliveryFee = typeof after.deliveryFee === "number" ? `$${after.deliveryFee.toFixed(2)}` : null;
    const serviceFee  = typeof after.serviceFee === "number" ? `$${after.serviceFee.toFixed(2)}` : null;
    const restaurant  = typeof after.restaurantName === "string" ? after.restaurantName :
                        (after.restaurant as Record<string, unknown>)?.name ?? "—";
    const method      = typeof after.paymentMethod === "string" ? after.paymentMethod : "Card";
    const fulfillment = typeof after.fulfillmentMode === "string" ? after.fulfillmentMode : "delivery";
    const time        = now();

    // ── Customer delivery address ─────────────────────────────────────────────
    const deliveryLoc = after.deliveryLocation as Record<string, unknown> | undefined;
    const deliveryAddress = typeof deliveryLoc?.address === "string"
      ? deliveryLoc.address
      : typeof after.deliveryAddress === "string" ? after.deliveryAddress : "—";
    const delivLat = typeof deliveryLoc?.lat === "number" ? deliveryLoc.lat : null;
    const delivLng = typeof deliveryLoc?.lng === "number" ? deliveryLoc.lng : null;
    const delivMapsLink = delivLat && delivLng
      ? `https://www.google.com/maps?q=${delivLat},${delivLng}`
      : deliveryAddress !== "—"
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deliveryAddress)}`
        : null;

    // ── Restaurant address ────────────────────────────────────────────────────
    const restaurantObj = after.restaurant as Record<string, unknown> | undefined;
    const restaurantAddress =
      typeof restaurantObj?.address === "string" ? restaurantObj.address :
      typeof after.restaurantAddress === "string" ? after.restaurantAddress : null;
    const restLocObj = after.restaurantLocation as Record<string, unknown> | undefined;
    const restLat = typeof restLocObj?.lat === "number" ? restLocObj.lat :
                    typeof restLocObj?.latitude === "number" ? restLocObj.latitude : null;
    const restLng = typeof restLocObj?.lng === "number" ? restLocObj.lng :
                    typeof restLocObj?.longitude === "number" ? restLocObj.longitude : null;
    const restMapsLink = restLat && restLng
      ? `https://www.google.com/maps?q=${restLat},${restLng}`
      : restaurantAddress
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurantAddress)}`
        : null;

    // Order items
    type OrderItem = { name?: string; qty?: number; price?: number };
    const items: OrderItem[] = Array.isArray(after.items) ? (after.items as OrderItem[]) : [];

    // Fetch user profile
    let userEmail = "—";
    let userName  = "—";
    let userPhone = "—";
    try {
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      const u = userDoc.data() as Record<string, unknown> | undefined;
      if (u) {
        userEmail = typeof u.email === "string" ? u.email : "—";
        userName  = typeof u.displayName === "string" ? u.displayName :
                    typeof u.name === "string" ? u.name : "—";
        userPhone = typeof u.phone === "string" ? u.phone :
                    typeof u.phoneNumber === "string" ? u.phoneNumber :
                    typeof u.whatsapp === "string" ? u.whatsapp : "—";
      }
    } catch {
      // non-fatal
    }

    // Build items HTML
    const itemsHtml = items.length > 0
      ? items.map((item) => {
          const name = item.name ?? "Item";
          const qty  = item.qty ?? 1;
          const price = typeof item.price === "number" ? `$${(item.price * qty).toFixed(2)}` : "";
          return `<tr>
            <td style="padding:6px 0;color:#374151;font-size:13px;">${qty}× ${name}</td>
            <td style="padding:6px 0;color:#374151;font-size:13px;text-align:right;">${price}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="2" style="padding:6px 0;color:#9CA3AF;font-size:13px;">No items recorded</td></tr>`;

    const html = `
      <div style="font-family:sans-serif;max-width:580px;margin:auto;background:#f9fafb;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

        <!-- Header -->
        <div style="background:#16A34A;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:20px;">💳 Payment Received</h2>
          <p style="color:#BBF7D0;margin:4px 0 0;font-size:13px;">${APP_NAME} · ${time}</p>
        </div>

        <!-- Total -->
        <div style="padding:20px 24px 0;">
          <div style="background:#ECFDF5;border-radius:10px;padding:14px 18px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#166534;">Total charged</p>
            <p style="margin:4px 0 0;font-size:36px;font-weight:900;color:#15803D;">${total}</p>
          </div>
        </div>

        <!-- Customer info -->
        <div style="padding:20px 24px 0;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">👤 Customer</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#6B7280;font-size:13px;width:130px;">Name</td><td style="padding:6px 0;font-weight:700;color:#111827;">${userName}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280;font-size:13px;">Email</td><td style="padding:6px 0;color:#374151;">${userEmail}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280;font-size:13px;">Phone</td><td style="padding:6px 0;color:#374151;">${userPhone}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280;font-size:13px;">User ID</td><td style="padding:6px 0;color:#9CA3AF;font-family:monospace;font-size:11px;">${userId}</td></tr>
          </table>
        </div>

        <!-- Customer delivery location -->
        <div style="padding:16px 24px 0;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">🏠 Customer Delivery Address</p>
          <p style="margin:0;font-size:13px;color:#374151;">${deliveryAddress}</p>
          ${delivMapsLink ? `<a href="${delivMapsLink}" style="display:inline-block;margin-top:8px;font-size:12px;color:#2563EB;text-decoration:none;">📌 Open in Google Maps →</a>` : ""}
        </div>

        <!-- Restaurant location -->
        ${(restaurantAddress || restMapsLink) ? `
        <div style="padding:16px 24px 0;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">🍽️ Restaurant Location (Pickup)</p>
          ${restaurantAddress ? `<p style="margin:0;font-size:13px;color:#374151;">${restaurantAddress}</p>` : ""}
          ${restMapsLink ? `<a href="${restMapsLink}" style="display:inline-block;margin-top:8px;font-size:12px;color:#2563EB;text-decoration:none;">📍 Open Restaurant in Google Maps →</a>` : ""}
        </div>` : ""}

        <!-- Order items -->
        <div style="padding:16px 24px 0;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">🍽️ Order Items — ${String(restaurant)}</p>
          <table style="width:100%;border-collapse:collapse;">
            ${itemsHtml}
          </table>
        </div>

        <!-- Pricing breakdown -->
        <div style="padding:16px 24px 0;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">💰 Pricing</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Subtotal</td><td style="padding:5px 0;color:#374151;text-align:right;">${subtotal}</td></tr>
            ${deliveryFee ? `<tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Delivery fee</td><td style="padding:5px 0;color:#374151;text-align:right;">${deliveryFee}</td></tr>` : ""}
            ${serviceFee ? `<tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Service fee</td><td style="padding:5px 0;color:#374151;text-align:right;">${serviceFee}</td></tr>` : ""}
            <tr style="border-top:1px solid #E5E7EB;">
              <td style="padding:8px 0;font-weight:800;color:#111827;font-size:14px;">Total</td>
              <td style="padding:8px 0;font-weight:900;color:#15803D;text-align:right;font-size:16px;">${total}</td>
            </tr>
          </table>
        </div>

        <!-- Order meta -->
        <div style="padding:16px 24px 20px;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">🧾 Order Details</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;width:130px;">Order ID</td><td style="padding:5px 0;color:#374151;font-family:monospace;font-size:11px;">${orderId}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Payment method</td><td style="padding:5px 0;color:#374151;">${method}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Fulfillment</td><td style="padding:5px 0;color:#374151;">${fulfillment}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Time</td><td style="padding:5px 0;color:#374151;">${time}</td></tr>
          </table>
        </div>

        <!-- Footer -->
        <div style="background:#F3F4F6;padding:12px 24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">${APP_NAME} Admin · Auto-generated notification</p>
        </div>
      </div>
    `;

    // ── Push notification (runs in parallel with email) ───────────────────────
    const pushPromise = getAdminPushTokens().then((tokens) =>
      Promise.all(
        tokens.map((token) =>
          sendExpoPush(
            token,
            `💳 طلب جديد — ${total}`,
            `${String(restaurant)} · ${userName}`,
            { orderId, screen: "admin-notifications" },
          ),
        ),
      ),
    ).catch((err) => {
      functions.logger.error("onPaymentCompleted: push failed", err);
    });

    // ── Email ────────────────────────────────────────────────────────────────
    const emailPromise = (async () => {
      try {
        const transport = makeTransport(gmailAppPassword.value());
        await transport.sendMail({
          from: `"${APP_NAME} Admin" <${GMAIL_USER}>`,
          to: ADMIN_EMAIL,
          subject: `💳 ${total} — ${String(restaurant)} · ${userName}`,
          html,
        });
        functions.logger.info("onPaymentCompleted: email sent", { orderId, total });
      } catch (err) {
        functions.logger.error("onPaymentCompleted: email failed", err);
      }
    })();

    await Promise.all([pushPromise, emailPromise]);
  });

// ── 3. Food Share match created ───────────────────────────────────────────────

export const onFoodShareMatch = functions
  .runWith({ secrets: ["GMAIL_APP_PASSWORD"] })
  .firestore.document("matches/{matchId}")
  .onCreate(async (snap, context) => {
    const matchId = context.params.matchId as string;
    const data = snap.data() as Record<string, unknown>;

    const foodName      = typeof data.foodName === "string" ? data.foodName : "—";
    const restaurant    = typeof data.restaurantName === "string" ? data.restaurantName : "—";
    const lifecycle     = typeof data.lifecycle === "string" ? data.lifecycle : "—";
    const adminShareId  = typeof data.adminFoodShareId === "string" ? data.adminFoodShareId : "—";
    const time          = now();

    // Extract userA / userB UIDs
    const userAObj = data.userA as Record<string, unknown> | undefined;
    const userBObj = data.userB as Record<string, unknown> | undefined;
    const uidA = typeof userAObj?.uid === "string" ? userAObj.uid : null;
    const uidB = typeof userBObj?.uid === "string" ? userBObj.uid : null;

    // Payment statuses
    const payments = (data.userPayments ?? {}) as Record<string, { paymentStatus?: string; amount?: number }>;

    // Fetch user profiles in parallel
    type UserProfile = { name: string; email: string; phone: string };
    async function fetchUser(uid: string | null): Promise<UserProfile> {
      if (!uid) return { name: "—", email: "—", phone: "—" };
      try {
        const doc = await admin.firestore().collection("users").doc(uid).get();
        const u = doc.data() as Record<string, unknown> | undefined;
        if (!u) return { name: "—", email: "—", phone: "—" };
        return {
          name:  typeof u.displayName === "string" ? u.displayName : typeof u.name === "string" ? u.name : "—",
          email: typeof u.email === "string" ? u.email : "—",
          phone: typeof u.phone === "string" ? u.phone : typeof u.phoneNumber === "string" ? u.phoneNumber : typeof u.whatsapp === "string" ? u.whatsapp : "—",
        };
      } catch {
        return { name: "—", email: "—", phone: "—" };
      }
    }

    const [profA, profB] = await Promise.all([fetchUser(uidA), fetchUser(uidB)]);

    const payStatusA = uidA && payments[uidA]?.paymentStatus ? payments[uidA].paymentStatus! : "PENDING";
    const payStatusB = uidB && payments[uidB]?.paymentStatus ? payments[uidB].paymentStatus! : "PENDING";

    function userRow(label: string, prof: UserProfile, uid: string | null, payStatus: string): string {
      return `
        <tr><td colspan="2" style="padding:10px 0 4px;font-weight:700;color:#111827;font-size:14px;border-top:1px solid #E5E7EB;">${label}</td></tr>
        <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;width:140px;">Name</td><td style="padding:4px 0;font-weight:600;color:#111827;">${prof.name}</td></tr>
        <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Email</td><td style="padding:4px 0;color:#374151;">${prof.email}</td></tr>
        <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Phone</td><td style="padding:4px 0;color:#374151;">${prof.phone}</td></tr>
        <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">User ID</td><td style="padding:4px 0;color:#9CA3AF;font-family:monospace;font-size:11px;">${uid ?? "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Payment</td><td style="padding:4px 0;color:${payStatus === "PAID" ? "#16A34A" : "#D97706"};font-weight:700;">${payStatus}</td></tr>
      `;
    }

    const html = `
      <div style="font-family:sans-serif;max-width:580px;margin:auto;background:#f9fafb;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#7C3AED;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:20px;">🤝 New Food Share Match</h2>
          <p style="color:#DDD6FE;margin:4px 0 0;font-size:13px;">${APP_NAME} · ${time}</p>
        </div>
        <div style="padding:20px 24px 0;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">🍽️ Food Share</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;width:140px;">Food</td><td style="padding:4px 0;font-weight:600;color:#111827;">${foodName}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Restaurant</td><td style="padding:4px 0;color:#374151;">${restaurant}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Lifecycle</td><td style="padding:4px 0;color:#374151;">${lifecycle}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Match ID</td><td style="padding:4px 0;color:#9CA3AF;font-family:monospace;font-size:11px;">${matchId}</td></tr>
            <tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Share ID</td><td style="padding:4px 0;color:#9CA3AF;font-family:monospace;font-size:11px;">${adminShareId}</td></tr>
          </table>
        </div>
        <div style="padding:16px 24px 20px;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">👥 Participants</p>
          <table style="width:100%;border-collapse:collapse;">
            ${userRow("👤 User A", profA, uidA, payStatusA)}
            ${userRow("👤 User B", profB, uidB, payStatusB)}
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
        subject: `🤝 Match: ${foodName} — ${profA.name} & ${profB.name}`,
        html,
      });
      functions.logger.info("onFoodShareMatch: email sent", { matchId });
    } catch (err) {
      functions.logger.error("onFoodShareMatch: email failed", err);
    }
  });

// ── 4. Food Share card booked / waiting for partner ───────────────────────────

export const onFoodShareWaiting = functions
  .runWith({ secrets: ["GMAIL_APP_PASSWORD"] })
  .firestore.document("matchRequests/{requestId}")
  .onCreate(async (snap, context) => {
    const requestId = context.params.requestId as string;
    const data = snap.data() as Record<string, unknown>;

    if (data.status !== "WAITING") return; // only care about waiting bookings

    const adminShareId = typeof data.adminFoodShareId === "string" ? data.adminFoodShareId : null;
    const userId       = typeof data.userId === "string" ? data.userId : null;
    const firstName    = typeof data.userFirstName === "string" ? data.userFirstName : "—";
    const time         = now();

    // Fetch user profile and share card in parallel
    async function fetchUser(uid: string | null): Promise<{ name: string; email: string; phone: string }> {
      if (!uid) return { name: firstName, email: "—", phone: "—" };
      try {
        const doc = await admin.firestore().collection("users").doc(uid).get();
        const u = doc.data() as Record<string, unknown> | undefined;
        if (!u) return { name: firstName, email: "—", phone: "—" };
        return {
          name:  typeof u.displayName === "string" ? u.displayName : typeof u.name === "string" ? u.name : firstName,
          email: typeof u.email === "string" ? u.email : "—",
          phone: typeof u.phone === "string" ? u.phone : typeof u.phoneNumber === "string" ? u.phoneNumber : typeof u.whatsapp === "string" ? u.whatsapp : "—",
        };
      } catch {
        return { name: firstName, email: "—", phone: "—" };
      }
    }

    async function fetchShare(shareId: string | null): Promise<Record<string, unknown>> {
      if (!shareId) return {};
      try {
        const doc = await admin.firestore().collection("adminFoodShares").doc(shareId).get();
        return (doc.data() as Record<string, unknown>) ?? {};
      } catch {
        return {};
      }
    }

    const [prof, share] = await Promise.all([fetchUser(userId), fetchShare(adminShareId)]);

    const foodName   = typeof share.foodName === "string" ? share.foodName : "—";
    const restaurant = typeof share.restaurantName === "string" ? share.restaurantName : "—";
    const sharedPrice = typeof share.sharedPrice === "number" ? `$${share.sharedPrice.toFixed(2)}` :
                        typeof share.sharingPrice === "number" ? `$${(share.sharingPrice as number).toFixed(2)}` : "—";
    const delivFee   = typeof share.deliveryShare === "number" ? `$${(share.deliveryShare as number).toFixed(2)}` : "—";

    const html = `
      <div style="font-family:sans-serif;max-width:580px;margin:auto;background:#f9fafb;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#F59E0B;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:20px;">⏳ Card Booked — Waiting for Partner</h2>
          <p style="color:#FEF3C7;margin:4px 0 0;font-size:13px;">${APP_NAME} · ${time}</p>
        </div>
        <div style="padding:20px 24px 0;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">👤 Customer</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;width:130px;">Name</td><td style="padding:5px 0;font-weight:600;color:#111827;">${prof.name}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Email</td><td style="padding:5px 0;color:#374151;">${prof.email}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Phone</td><td style="padding:5px 0;color:#374151;">${prof.phone}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">User ID</td><td style="padding:5px 0;color:#9CA3AF;font-family:monospace;font-size:11px;">${userId ?? "—"}</td></tr>
          </table>
        </div>
        <div style="padding:16px 24px 20px;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #E5E7EB;padding-bottom:8px;">🍽️ Food Share Card</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;width:130px;">Food</td><td style="padding:5px 0;font-weight:600;color:#111827;">${foodName}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Restaurant</td><td style="padding:5px 0;color:#374151;">${restaurant}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Shared price</td><td style="padding:5px 0;color:#374151;">${sharedPrice}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Delivery share</td><td style="padding:5px 0;color:#374151;">${delivFee}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Share ID</td><td style="padding:5px 0;color:#9CA3AF;font-family:monospace;font-size:11px;">${adminShareId ?? "—"}</td></tr>
            <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Request ID</td><td style="padding:5px 0;color:#9CA3AF;font-family:monospace;font-size:11px;">${requestId}</td></tr>
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
        subject: `⏳ Booked: ${foodName} — ${prof.name} waiting for partner`,
        html,
      });
      functions.logger.info("onFoodShareWaiting: email sent", { requestId });
    } catch (err) {
      functions.logger.error("onFoodShareWaiting: email failed", err);
    }
  });
