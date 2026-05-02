const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');

const { notifyUsersExpo } = require('./lib/expoPush');

admin.initializeApp();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const checkoutCurrency = (process.env.STRIPE_CHECKOUT_CURRENCY || 'cad').toLowerCase();
const platformFeePercent = Number(process.env.STRIPE_PLATFORM_FEE_PERCENT || '7');
const connectReturnUrl =
  process.env.STRIPE_CONNECT_RETURN_URL || 'https://halforder.app/restaurant-dashboard';
const connectRefreshUrl =
  process.env.STRIPE_CONNECT_REFRESH_URL || connectReturnUrl;

function allowedRedirectPrefixes() {
  const raw = process.env.STRIPE_ALLOWED_REDIRECT_PREFIXES || '';
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = [
    'halforder://',
    'exp://',
    'https://halforder.app',
    'https://www.halforder.app',
  ];
  return [...defaults, ...parts];
}

function isAllowedCheckoutRedirectUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return allowedRedirectPrefixes().some((p) => urlString.startsWith(p));
    }
    if (u.protocol === 'halforder:' || u.protocol === 'exp:') {
      return allowedRedirectPrefixes().some((p) => urlString.startsWith(p));
    }
  } catch {
    return false;
  }
  return false;
}

/** Inbound address for feedback + daily report (not secret). */
const SUPPORT_INBOX = 'support@halforder.app';

/**
 * Nodemailer config via environment variables (v2 style).
 * Required:
 * - GMAIL_USER
 * - GMAIL_APP_PASSWORD
 * Optional SMTP fallback:
 * - SMTP_USER
 * - SMTP_PASS
 */
function getMailTransporter() {
  const user =
    process.env.GMAIL_USER || process.env.SMTP_USER || '';
  const pass =
    process.env.GMAIL_APP_PASSWORD ||
    process.env.SMTP_PASS ||
    '';
  if (!user || !pass) {
    throw new Error(
      'Mail not configured: set GMAIL_USER and GMAIL_APP_PASSWORD',
    );
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

exports.createStripeAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  try {
    if (!stripe) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Stripe is not configured. Missing STRIPE_SECRET_KEY.',
      );
    }
    const restaurantId = (
      typeof data?.restaurantId === 'string' ? data.restaurantId.trim() : context.auth.uid
    );
    if (restaurantId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'restaurantId must match the signed-in user',
      );
    }
    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { firebaseRestaurantId: restaurantId },
    });
    await admin
      .firestore()
      .doc(`restaurants/${restaurantId}`)
      .set({ stripeAccountId: account.id }, { merge: true });
    return { accountId: account.id };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('[createStripeAccount] failed', error);
    throw new functions.https.HttpsError('internal', 'Unable to create Stripe account');
  }
});

exports.createOnboardingLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  try {
    if (!stripe) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Stripe is not configured. Missing STRIPE_SECRET_KEY.',
      );
    }
    const restaurantId = (
      typeof data?.restaurantId === 'string' ? data.restaurantId.trim() : context.auth.uid
    );
    if (restaurantId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'restaurantId must match the signed-in user',
      );
    }
    const snap = await admin.firestore().doc(`restaurants/${restaurantId}`).get();
    const accountId = typeof snap.get('stripeAccountId') === 'string' ? snap.get('stripeAccountId') : '';
    if (!accountId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Create a Stripe account first',
      );
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: connectReturnUrl,
      refresh_url: connectRefreshUrl,
    });
    return { url: link.url };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('[createOnboardingLink] failed', error);
    throw new functions.https.HttpsError('internal', 'Unable to create onboarding link');
  }
});

exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  if (!stripe) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Stripe is not configured. Missing STRIPE_SECRET_KEY.',
    );
  }
  const orderId = typeof data?.orderId === 'string' ? data.orderId.trim() : '';
  const successUrl = typeof data?.successUrl === 'string' ? data.successUrl.trim() : '';
  const cancelUrl = typeof data?.cancelUrl === 'string' ? data.cancelUrl.trim() : '';
  if (!orderId || !successUrl || !cancelUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId, successUrl, cancelUrl required');
  }
  if (!isAllowedCheckoutRedirectUrl(successUrl) || !isAllowedCheckoutRedirectUrl(cancelUrl)) {
    throw new functions.https.HttpsError('invalid-argument', 'Redirect URL not allowed');
  }

  const db = admin.firestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Order not found');
  }
  const order = orderSnap.data() || {};
  if (order.userId !== context.auth.uid && order.customerId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your order');
  }
  if (order.status !== 'awaiting_payment' || order.paymentStatus !== 'unpaid') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Order is not awaiting payment',
    );
  }

  const restaurantId = typeof order.restaurantId === 'string' ? order.restaurantId : '';
  if (!restaurantId) {
    throw new functions.https.HttpsError('failed-precondition', 'Order missing restaurant');
  }
  const restSnap = await db.doc(`restaurants/${restaurantId}`).get();
  const destination =
    typeof restSnap.get('stripeAccountId') === 'string' ? restSnap.get('stripeAccountId') : '';
  if (!destination || !String(destination).startsWith('acct_')) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Restaurant has not finished Stripe Connect onboarding',
    );
  }

  const totalCents = Math.round(Number(order.totalPrice || order.total || 0) * 100);
  if (!Number.isFinite(totalCents) || totalCents < 50) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid order total');
  }

  const feePct = Number.isFinite(platformFeePercent) ? platformFeePercent : 7;
  const applicationFeeAmount = Math.min(
    totalCents - 1,
    Math.max(0, Math.round((totalCents * feePct) / 100)),
  );

  const items = Array.isArray(order.items) ? order.items : [];
  const lineItems = [];
  let sum = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Item';
    const qty = Math.max(1, Math.min(99, Math.round(Number(raw.qty) || 1)));
    const unitCents = Math.round(Number(raw.price) * 100);
    if (!Number.isFinite(unitCents) || unitCents <= 0) continue;
    const lineTotal = unitCents * qty;
    sum += lineTotal;
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: checkoutCurrency,
        product_data: { name },
        unit_amount: unitCents,
      },
    });
  }
  if (lineItems.length === 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: checkoutCurrency,
        product_data: { name: 'Order total' },
        unit_amount: totalCents,
      },
    });
  } else if (sum !== totalCents) {
    const delta = totalCents - sum;
    if (delta > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: checkoutCurrency,
          product_data: { name: 'Adjustment' },
          unit_amount: delta,
        },
      });
    } else {
      lineItems.length = 0;
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: checkoutCurrency,
          product_data: { name: 'Food order' },
          unit_amount: totalCents,
        },
      });
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: orderId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { orderId, firebaseUid: context.auth.uid },
    line_items: lineItems,
    payment_intent_data: {
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination },
      metadata: { orderId },
    },
  });

  await orderRef.set(
    {
      stripeCheckoutSessionId: session.id,
    },
    { merge: true },
  );

  return { url: session.url, sessionId: session.id };
});

exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  if (!stripe) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Stripe is not configured. Missing STRIPE_SECRET_KEY.',
    );
  }
  const amount = Math.round(Number(data?.amount));
  const accountId = typeof data?.accountId === 'string' ? data.accountId.trim() : '';
  if (!Number.isFinite(amount) || amount < 50 || !accountId.startsWith('acct_')) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount or accountId');
  }
  const snap = await admin.firestore().doc(`restaurants/${context.auth.uid}`).get();
  const linked = typeof snap.get('stripeAccountId') === 'string' ? snap.get('stripeAccountId') : '';
  if (linked !== accountId) {
    throw new functions.https.HttpsError('permission-denied', 'accountId does not match restaurant');
  }
  const pi = await stripe.paymentIntents.create({
    amount,
    currency: checkoutCurrency,
    automatic_payment_methods: { enabled: true },
    application_fee_amount: Math.min(amount - 1, Math.round((amount * (platformFeePercent || 7)) / 100)),
    transfer_data: { destination: accountId },
  });
  return { clientSecret: pi.client_secret };
});

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  if (!stripe || !stripeWebhookSecret) {
    console.error('[stripeWebhook] missing stripe or STRIPE_WEBHOOK_SECRET');
    res.status(500).send('Server misconfiguration');
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).send('Missing stripe-signature');
    return;
  }

  let event;
  try {
    const payload = req.rawBody || Buffer.from('');
    event = stripe.webhooks.constructEvent(payload, sig, stripeWebhookSecret);
  } catch (err) {
    console.error('[stripeWebhook] signature verify failed', err);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type !== 'checkout.session.completed') {
    res.json({ received: true });
    return;
  }

  const session = event.data.object;
  const orderId =
    (session.metadata && session.metadata.orderId) ||
    (typeof session.client_reference_id === 'string' ? session.client_reference_id : '');
  if (!orderId) {
    console.error('[stripeWebhook] missing orderId on session', session.id);
    res.status(200).send('ignored');
    return;
  }

  const db = admin.firestore();
  const eventRef = db.doc(`stripe_events/${event.id}`);
  const orderRef = db.doc(`orders/${orderId}`);

  try {
    await db.runTransaction(async (t) => {
      const evSnap = await t.get(eventRef);
      if (evSnap.exists) {
        return;
      }
      const orderSnap = await t.get(orderRef);
      if (!orderSnap.exists) {
        throw new Error('order_missing');
      }
      const o = orderSnap.data() || {};
      if (o.paymentStatus === 'paid') {
        t.set(eventRef, { type: event.type, orderId, duplicate: true, at: admin.firestore.FieldValue.serverTimestamp() });
        return;
      }
      if (o.status !== 'awaiting_payment' || o.paymentStatus !== 'unpaid') {
        throw new Error('order_state');
      }
      t.set(eventRef, {
        type: event.type,
        orderId,
        checkoutSessionId: session.id,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
      t.update(orderRef, {
        status: 'pending',
        paymentStatus: 'paid',
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: (() => {
          const pi = session.payment_intent;
          if (typeof pi === 'string') return pi;
          if (pi && typeof pi === 'object' && typeof pi.id === 'string') return pi.id;
          return null;
        })(),
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        estimatedDeliveryTime: 35,
      });
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg === 'order_missing' || msg === 'order_state') {
      console.warn('[stripeWebhook] non-retryable', msg, orderId);
      res.status(200).json({ received: true, note: msg });
      return;
    }
    console.error('[stripeWebhook] transaction failed', e);
    res.status(500).send('retry');
    return;
  }

  res.json({ received: true });
});

exports.createPaymentIntentHttp = functions.https.onRequest(async (req, res) => {
  try {
    const stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Missing amount' });
    }

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const ADMIN_FCM_TOKEN = process.env.ADMIN_FCM_TOKEN || '';

const BADGE_TRUSTED = '🔥 Trusted';
const BADGE_FAST_JOINER = '⚡ Fast Joiner';
const BADGE_COMMUNICATIVE = '💬 Communicative';
const BADGE_FOOD_LOVER = '🍕 Food Lover';
const MAX_CANCELLATIONS_PER_24H = 3;
const REPORT_RESTRICTION_THRESHOLD = 5;
/** UGC: surface “flagged” to clients to hide user content (lighter than `restricted`). */
const REPORT_FLAG_THRESHOLD = 3;

function computeTrustScore({
  averageRating = 0,
  totalOrdersCompleted = 0,
  cancellationRate = 0,
  reportCount = 0,
}) {
  const normalizedCancellation =
    cancellationRate > 1 ? cancellationRate / 100 : cancellationRate;
  return Number(
    (
      averageRating * 0.5 +
      totalOrdersCompleted * 0.3 -
      normalizedCancellation * 0.1 -
      reportCount * 0.1
    ).toFixed(2),
  );
}

function computeBadges({
  averageRating = 0,
  totalOrdersCompleted = 0,
  ordersJoined = 0,
  messagesSent = 0,
}) {
  const badges = [];
  if (averageRating >= 4.5 && totalOrdersCompleted >= 8) {
    badges.push(BADGE_TRUSTED);
  }
  if (ordersJoined >= 10) {
    badges.push(BADGE_FAST_JOINER);
  }
  if (messagesSent >= 30) {
    badges.push(BADGE_COMMUNICATIVE);
  }
  if (totalOrdersCompleted >= 20) {
    badges.push(BADGE_FOOD_LOVER);
  }
  return badges;
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeCancellationRate(value = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value > 1 ? value / 100 : value;
}

function sameStringArray(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function computeSuspiciousSignals({
  reportCount = 0,
  cancellationRate = 0,
  cancellationCount24h = 0,
  totalOrdersCompleted = 0,
}) {
  const signals = [];
  const normalizedCancelRate = normalizeCancellationRate(cancellationRate);
  if (reportCount >= 3) signals.push('high_reports');
  if (normalizedCancelRate >= 0.5 && totalOrdersCompleted >= 4) {
    signals.push('high_cancellation_rate');
  }
  if (cancellationCount24h >= MAX_CANCELLATIONS_PER_24H) {
    signals.push('frequent_daily_cancellations');
  }
  return signals;
}

async function refreshUserDerivedFields(db, userId) {
  const userRef = db.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};

  const averageRating =
    typeof userData?.averageRating === 'number' ? userData.averageRating : 0;
  const totalOrdersCompleted =
    typeof userData?.totalOrdersCompleted === 'number'
      ? userData.totalOrdersCompleted
      : typeof userData?.ordersCount === 'number'
        ? userData.ordersCount
        : 0;
  const cancellationRate =
    typeof userData?.cancellationRate === 'number' ? userData.cancellationRate : 0;
  const reportCount = typeof userData?.reportCount === 'number' ? userData.reportCount : 0;
  const ordersJoined = typeof userData?.ordersJoined === 'number' ? userData.ordersJoined : 0;
  const messagesSent = typeof userData?.messagesSent === 'number' ? userData.messagesSent : 0;
  const cancellationCount24h =
    typeof userData?.cancellationCount24h === 'number' ? userData.cancellationCount24h : 0;

  const trustScore = computeTrustScore({
    averageRating,
    totalOrdersCompleted,
    cancellationRate,
    reportCount,
  });
  const badges = computeBadges({
    averageRating,
    totalOrdersCompleted,
    ordersJoined,
    messagesSent,
  });
  const currentBadges = Array.isArray(userData?.badges)
    ? userData.badges.filter((x) => typeof x === 'string')
    : [];
  const suspiciousSignals = computeSuspiciousSignals({
    reportCount,
    cancellationRate,
    cancellationCount24h,
    totalOrdersCompleted,
  });
  const suspicious = suspiciousSignals.length > 0;
  const shouldRestrictForReports = reportCount >= REPORT_RESTRICTION_THRESHOLD;
  const alreadyRestricted = userData?.restricted === true;
  const shouldFlag = reportCount >= REPORT_FLAG_THRESHOLD;
  const flaggedCurrent =
    userData?.isFlagged === true || userData?.flagged === true;

  const needsUpdate =
    trustScore !== (typeof userData?.trustScore === 'number' ? userData.trustScore : 0) ||
    !arraysEqual(currentBadges, badges) ||
    userData?.suspicious !== suspicious ||
    !sameStringArray(
      Array.isArray(userData?.suspiciousSignals)
        ? userData.suspiciousSignals.filter((x) => typeof x === 'string')
        : [],
      suspiciousSignals,
    ) ||
    (shouldRestrictForReports && !alreadyRestricted) ||
    shouldFlag !== flaggedCurrent;

  if (!needsUpdate) return;
  const updates = {
    trustScore,
    badges,
    suspicious,
    suspiciousSignals,
    isFlagged: shouldFlag,
  };
  if (shouldRestrictForReports && !alreadyRestricted) {
    updates.restricted = true;
    updates.restrictedReason = 'Too many reports';
    updates.restrictedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await userRef.set(updates, { merge: true });
}

function resolveOrderOwnerId(orderData = {}) {
  if (typeof orderData.createdBy === 'string' && orderData.createdBy) {
    return orderData.createdBy;
  }
  if (typeof orderData.hostId === 'string' && orderData.hostId) {
    return orderData.hostId;
  }
  if (typeof orderData.userId === 'string' && orderData.userId) {
    return orderData.userId;
  }
  return null;
}

exports.onSupportMessage = functions.firestore
  .document('support_chats/{userId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const sender = data?.sender;

    if (sender !== 'user') return null;

    if (!ADMIN_FCM_TOKEN) {
      console.warn('ADMIN_FCM_TOKEN not set, skipping notification');
      return null;
    }

    const text =
      typeof data?.text === 'string' ? data.text.slice(0, 100) : 'New message';

    await admin.messaging().send({
      token: ADMIN_FCM_TOKEN,
      notification: {
        title: 'Support: New message',
        body: text,
      },
      data: {
        userId: context.params.userId,
      },
    });

    return null;
  });

exports.sendOrderInvite = functions.firestore
  .document('invites/{inviteId}')
  .onCreate(async (snap, context) => {
    const inviteId = context.params.inviteId;
    const data = snap.data();
    const email = typeof data?.email === 'string' ? data.email : '';
    const orderId = typeof data?.orderId === 'string' ? data.orderId : '';
    const inviterName =
      typeof data?.inviterName === 'string' ? data.inviterName : 'Someone';

    if (!email || !orderId) {
      console.error('sendOrderInvite: missing email or orderId', {
        inviteId,
        email,
        orderId,
      });
      await snap.ref
        .update({ status: 'failed', error: 'missing email or orderId' })
        .catch((err) => console.error(err));
      return null;
    }

    const inviteLink = `https://halforder.app/order/${orderId}`;
    const subject = 'You were invited to join an order';
    const body = `Hi,\n\n${inviterName} invited you to join a shared order on HalfOrder.\n\nClick here to join:\n${inviteLink}`;

    try {
      const transport = getMailTransporter();
      await transport.sendMail({
        from: '"HalfOrder" <noreply@halforder.app>',
        to: email,
        subject,
        text: body,
      });
      await snap.ref.update({ status: 'sent' });
    } catch (err) {
      console.error('sendOrderInvite: failed to send email', inviteId, err);
      await snap.ref
        .update({ status: 'failed', error: err?.message || String(err) })
        .catch((e) => console.error(e));
    }
    return null;
  });

/**
 * When a rating is created, update the receiver's user document with
 * ratingAverage and ratingCount (recomputed from all ratings for that user).
 */
exports.onRatingCreated = functions.firestore
  .document('ratings/{ratingId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const toUserId = typeof data?.toUserId === 'string' ? data.toUserId : null;
    if (!toUserId) return null;

    const db = admin.firestore();
    const ratingsSnap = await db
      .collection('ratings')
      .where('toUserId', '==', toUserId)
      .get();
    let sum = 0;
    let count = 0;
    ratingsSnap.docs.forEach((d) => {
      const r = d.data().rating;
      if (typeof r === 'number') {
        sum += r;
        count += 1;
      }
    });
    const ratingAverage = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    const userRef = db.doc(`users/${toUserId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const totalOrdersCompleted =
      typeof userData?.totalOrdersCompleted === 'number'
        ? userData.totalOrdersCompleted
        : typeof userData?.ordersCount === 'number'
          ? userData.ordersCount
          : 0;
    const cancellationRate =
      typeof userData?.cancellationRate === 'number' ? userData.cancellationRate : 0;
    const reportCount = typeof userData?.reportCount === 'number' ? userData.reportCount : 0;
    const trustScore = computeTrustScore({
      averageRating: ratingAverage,
      totalOrdersCompleted,
      cancellationRate,
      reportCount,
    });

    await userRef.set(
      {
        ratingAverage,
        ratingCount: count,
        averageRating: ratingAverage,
        totalRatings: count,
        totalOrdersCompleted,
        cancellationRate,
        reportCount,
        trustScore,
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, toUserId);
    return null;
  });

exports.onReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    const reportedUserId =
      typeof data?.reportedUserId === 'string' ? data.reportedUserId : null;
    if (!reportedUserId) return null;

    const db = admin.firestore();
    const userRef = db.doc(`users/${reportedUserId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const averageRating =
      typeof userData?.averageRating === 'number' ? userData.averageRating : 0;
    const totalOrdersCompleted =
      typeof userData?.totalOrdersCompleted === 'number'
        ? userData.totalOrdersCompleted
        : typeof userData?.ordersCount === 'number'
          ? userData.ordersCount
          : 0;
    const cancellationRate =
      typeof userData?.cancellationRate === 'number' ? userData.cancellationRate : 0;
    const reportCount = (typeof userData?.reportCount === 'number' ? userData.reportCount : 0) + 1;

    const trustScore = computeTrustScore({
      averageRating,
      totalOrdersCompleted,
      cancellationRate,
      reportCount,
    });

    await userRef.set(
      {
        reportCount,
        trustScore,
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, reportedUserId);
    return null;
  });

exports.onOrderMessageCreated = functions.firestore
  .document('orders/{orderId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const senderId = typeof data.senderId === 'string' ? data.senderId : null;
    if (!senderId) return null;

    const db = admin.firestore();
    const userRef = db.doc(`users/${senderId}`);
    await userRef.set(
      {
        messagesSent: admin.firestore.FieldValue.increment(1),
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, senderId);

    const orderId = context.params.orderId;
    const messageId = context.params.messageId;
    const isSystem =
      data.type === 'system' ||
      senderId === 'system' ||
      String(data.senderName ?? '').toLowerCase() === 'system';
    if (!isSystem && orderId) {
      try {
        const orderSnap = await db.doc(`orders/${orderId}`).get();
        if (orderSnap.exists) {
          const od = orderSnap.data() || {};
          const members = orderMemberIds(od);
          const recipients = members.filter((id) => id !== senderId);
          if (recipients.length > 0) {
            const bodyText =
              typeof data.text === 'string' && data.text.trim()
                ? data.text.trim().slice(0, 200)
                : 'New message';
            const senderNameRaw =
              (typeof data.userName === 'string' && data.userName.trim()) ||
              (typeof data.senderName === 'string' && data.senderName.trim()) ||
              '';
            const title = senderNameRaw || 'Order chat';
            await notifyUsersExpo(db, recipients, title, bodyText, {
              type: 'order_message',
              orderId,
              messageId,
            });
          }
        }
      } catch (e) {
        console.warn('[onOrderMessageCreated] push notify', orderId, e);
      }
    }

    return null;
  });

exports.onUserMetricsUpdated = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const watched = [
      'averageRating',
      'totalOrdersCompleted',
      'ordersCount',
      'cancellationRate',
      'reportCount',
      'ordersJoined',
      'messagesSent',
    ];
    const changed = watched.some((k) => before[k] !== after[k]);
    if (!changed) return null;
    const db = admin.firestore();
    await refreshUserDerivedFields(db, context.params.userId);
    return null;
  });

exports.onOrderCreated = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    const ownerId = resolveOrderOwnerId(data);
    if (!ownerId) return null;
    const db = admin.firestore();
    await db.doc(`users/${ownerId}`).set(
      {
        activeOrderCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

exports.onOrderDeleted = functions.firestore
  .document('orders/{orderId}')
  .onDelete(async (snap) => {
    const data = snap.data() || {};
    const ownerId = resolveOrderOwnerId(data);
    if (!ownerId) return null;
    const db = admin.firestore();
    const userRef = db.doc(`users/${ownerId}`);
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const current = userSnap.exists
        ? userSnap.data()?.activeOrderCount
        : 0;
      const currentCount = typeof current === 'number' ? current : 0;
      tx.set(
        userRef,
        { activeOrderCount: Math.max(0, currentCount - 1) },
        { merge: true },
      );
    });
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

exports.onOrderUpdatedSafety = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeOwnerId = resolveOrderOwnerId(before);
    const afterOwnerId = resolveOrderOwnerId(after);
    const db = admin.firestore();

    // if owner changes (rare), move active order ownership count
    if (beforeOwnerId && afterOwnerId && beforeOwnerId !== afterOwnerId) {
      const beforeRef = db.doc(`users/${beforeOwnerId}`);
      const afterRef = db.doc(`users/${afterOwnerId}`);
      await db.runTransaction(async (tx) => {
        const [beforeSnap, afterSnap] = await Promise.all([
          tx.get(beforeRef),
          tx.get(afterRef),
        ]);
        const beforeCount = typeof beforeSnap.data()?.activeOrderCount === 'number'
          ? beforeSnap.data().activeOrderCount
          : 0;
        const afterCount = typeof afterSnap.data()?.activeOrderCount === 'number'
          ? afterSnap.data().activeOrderCount
          : 0;
        tx.set(beforeRef, { activeOrderCount: Math.max(0, beforeCount - 1) }, { merge: true });
        tx.set(afterRef, { activeOrderCount: Math.max(0, afterCount + 1) }, { merge: true });
      });
      await Promise.all([
        refreshUserDerivedFields(db, beforeOwnerId),
        refreshUserDerivedFields(db, afterOwnerId),
      ]);
      return null;
    }

    const ownerId = afterOwnerId || beforeOwnerId;
    if (!ownerId) return null;

    const beforeStatus = typeof before.status === 'string' ? before.status : '';
    const afterStatus = typeof after.status === 'string' ? after.status : '';
    const userRef = db.doc(`users/${ownerId}`);

    // Count cancellations in rolling 24h window and keep a rate hint.
    if (beforeStatus !== 'cancelled' && afterStatus === 'cancelled') {
      await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const d = userSnap.exists ? userSnap.data() : {};
        const nowMs = Date.now();
        const windowStartMs =
          typeof d?.cancellationWindowStartMs === 'number'
            ? d.cancellationWindowStartMs
            : nowMs;
        const count24hRaw =
          typeof d?.cancellationCount24h === 'number' ? d.cancellationCount24h : 0;
        const withinWindow = nowMs - windowStartMs <= 24 * 60 * 60 * 1000;
        const cancellationCount24h = withinWindow ? count24hRaw + 1 : 1;
        const nextWindowStart = withinWindow ? windowStartMs : nowMs;
        const cancelledOrdersTotal =
          (typeof d?.cancelledOrders === 'number' ? d.cancelledOrders : 0) + 1;
        const completed =
          typeof d?.totalOrdersCompleted === 'number'
            ? d.totalOrdersCompleted
            : typeof d?.ordersCount === 'number'
              ? d.ordersCount
              : 0;
        const totalAttempts = completed + cancelledOrdersTotal;
        const cancellationRate = totalAttempts > 0
          ? cancelledOrdersTotal / totalAttempts
          : 0;
        tx.set(
          userRef,
          {
            cancellationCount24h,
            cancellationWindowStartMs: nextWindowStart,
            cancelledOrders: cancelledOrdersTotal,
            cancellationRate,
            lastCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    }

    // If order moves to terminal status, release one active slot.
    const becameTerminal =
      !['completed', 'cancelled', 'closed', 'expired'].includes(beforeStatus) &&
      ['completed', 'cancelled', 'closed', 'expired'].includes(afterStatus);
    if (becameTerminal) {
      await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const d = userSnap.exists ? userSnap.data() : {};
        const count = typeof d?.activeOrderCount === 'number' ? d.activeOrderCount : 0;
        tx.set(
          userRef,
          { activeOrderCount: Math.max(0, count - 1) },
          { merge: true },
        );
      });
    }
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

/**
 * When a new chat message is created, notify the other participant via Expo push.
 */
exports.onNewChatMessage = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const chatId = typeof data?.chatId === 'string' ? data.chatId : null;
    const senderId = typeof data?.senderId === 'string' ? data.senderId : null;
    if (!chatId || !senderId) return null;
    const db = admin.firestore();

    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists()) return null;
    const participants = chatSnap.data()?.participants;
    if (!Array.isArray(participants) || participants.length < 2) return null;
    const receiverId = participants.find((id) => id !== senderId);
    if (!receiverId) return null;

    const userSnap = await db.doc(`users/${receiverId}`).get();
    if (!userSnap.exists()) return null;
    const userData = userSnap.data();
    const token =
      userData?.fcmToken ?? userData?.expoPushToken ?? userData?.pushToken;
    if (typeof token !== 'string' || !token) return null;
    if (userData?.notificationsEnabled === false) return null;

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: 'New message',
          body: 'You received a message in HalfOrder',
          data: {
            type: 'chat_message',
            chatId,
            messageId: context.params.messageId,
          },
        }),
      });
      if (!response.ok) {
        console.warn('onNewChatMessage push failed', await response.text());
      }
    } catch (err) {
      console.warn('onNewChatMessage push error', err);
    }
    return null;
  });

/**
 * When a user submits a complaint, send an Expo push notification to the admin.
 * Admin push token is stored in Firestore: admins collection, document with email "support@halforder.app".
 */
exports.notifyAdminOnComplaint = functions.firestore
  .document('complaints/{complaintId}')
  .onCreate(async (snap, context) => {
    const db = admin.firestore();
    const adminSnapshot = await db
      .collection('admins')
      .where('email', '==', 'support@halforder.app')
      .limit(1)
      .get();

    if (adminSnapshot.empty) {
      console.warn(
        'notifyAdminOnComplaint: no admin document found for support@halforder.app',
      );
      return null;
    }

    const pushToken = adminSnapshot.docs[0].data()?.pushToken;
    if (typeof pushToken !== 'string' || !pushToken) {
      console.warn(
        'notifyAdminOnComplaint: admin pushToken missing or invalid',
      );
      return null;
    }

    const message = {
      to: pushToken,
      sound: 'default',
      title: 'New HalfOrder Message',
      body: 'A user sent a complaint or inquiry',
      data: { type: 'complaint', complaintId: context.params.complaintId },
    };

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      if (!response.ok) {
        console.warn(
          'notifyAdminOnComplaint push failed',
          await response.text(),
        );
      }
    } catch (err) {
      console.warn('notifyAdminOnComplaint push error', err);
    }
    return null;
  });

/**
 * New chat message under HalfOrder / order thread: `chats/{chatId}/messages/*`.
 * Sends via Expo Push API (not FCM directly).
 */
exports.sendMessageNotification = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    if (data.notificationSent === true) return null;
    const senderId = typeof data.senderId === 'string' ? data.senderId : null;
    if (!senderId || senderId === 'system') return null;
    if (data.sender === 'ai') return null;

    const db = admin.firestore();
    const chatId = context.params.chatId;
    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists) return null;
    const c = chatSnap.data() || {};
    const participants = Array.isArray(c.participants)
      ? c.participants.filter((x) => typeof x === 'string')
      : [];
    const users = Array.isArray(c.users) ? c.users.filter((x) => typeof x === 'string') : [];
    const members = participants.length > 0 ? participants : users;
    if (members.length === 0) return null;

    const recipients = members.filter((id) => id !== senderId);
    if (recipients.length === 0) return null;

    const bodyText =
      typeof data.text === 'string' && data.text.trim()
        ? data.text.trim().slice(0, 200)
        : 'New message';

    const senderNameRaw =
      (typeof data.userName === 'string' && data.userName.trim()) ||
      (typeof data.senderName === 'string' && data.senderName.trim()) ||
      '';
    const title = senderNameRaw || 'Someone';

    await notifyUsersExpo(db, recipients, title, bodyText, {
      type: 'chat_message',
      chatId,
      messageId: context.params.messageId,
    });

    return null;
  });

/** Member uids: rich `participants` maps, legacy string `participants`, or HalfOrder `users`. */
function orderMemberIds(data) {
  const p = Array.isArray(data?.participants) ? data.participants : [];
  const ids = [];
  for (const x of p) {
    if (typeof x === 'string' && x) ids.push(x);
    else if (x && typeof x === 'object' && typeof x.userId === 'string') ids.push(x.userId);
  }
  if (ids.length > 0) return ids;
  return Array.isArray(data?.users) ? data.users.filter((x) => typeof x === 'string') : [];
}

/**
 * Someone removed from order participants/users — notify remaining members via Expo.
 */
exports.joinCancelledNotification = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const db = admin.firestore();
    const orderId = context.params.orderId;

    if (before.status !== 'cancelled' && after.status === 'cancelled') {
      if (after.cancelPushSent === true) return null;
      const members = orderMemberIds(after);
      const cancelledBy =
        typeof after.cancelledBy === 'string' && after.cancelledBy
          ? after.cancelledBy
          : null;
      const cancelReason =
        typeof after.cancelReason === 'string' ? after.cancelReason : '';

      let targets = [];
      let title = 'Order cancelled';
      let body = 'The other person cancelled this half order.';

      if (cancelReason === 'wait_timeout') {
        title = 'HalfOrder';
        body = 'No one joined your order.';
        targets = members.filter(Boolean);
      } else if (cancelledBy) {
        targets = members.filter((id) => id && id !== cancelledBy);
      } else {
        targets = members.filter(Boolean);
      }

      if (targets.length > 0) {
        await notifyUsersExpo(db, targets, title, body, {
          type: 'order_cancelled',
          orderId,
        });
      }

      try {
        await change.after.ref.update({ cancelPushSent: true });
      } catch (e) {
        console.warn('[joinCancelledNotification] cancelPushSent', e?.message || e);
      }
      return null;
    }

    const beforeMembers = orderMemberIds(before);
    const afterMembers = orderMemberIds(after);
    const leavers = beforeMembers.filter((id) => !afterMembers.includes(id));
    if (leavers.length === 0) return null;

    const notifyIds = [...new Set(afterMembers)].filter(Boolean);
    if (notifyIds.length === 0) return null;

    await notifyUsersExpo(db, notifyIds, 'Order Update ❌', 'Someone left the order', {
      type: 'order_member_left',
      orderId: context.params.orderId,
    });

    return null;
  });

/**
 * Firestore `feedback/{id}` onCreate → email support (one send per new doc).
 */
exports.sendFeedbackEmail = functions.firestore
  .document('feedback/{feedbackId}')
  .onCreate(async (snap) => {
    const d = snap.data() || {};
    const userName = typeof d.userName === 'string' ? d.userName : 'Unknown';
    const message = typeof d.message === 'string' ? d.message : '';
    const textBody = `User: ${userName}\nMessage: ${message}`;
    try {
      const transport = getMailTransporter();
      await transport.sendMail({
        from: '"HalfOrder" <noreply@halforder.app>',
        to: SUPPORT_INBOX,
        subject: 'New Feedback',
        text: textBody,
      });
      console.log('[sendFeedbackEmail] success', snap.id);
    } catch (err) {
      console.error('[sendFeedbackEmail] failure', snap.id, err);
    }
    return null;
  });
