require('dotenv').config();

const os = require('os');
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.warn('STRIPE_SECRET_KEY is not set.');
}
const stripe = new Stripe(stripeKey || '', { apiVersion: '2024-06-20' });

const connectReturnUrl =
  process.env.STRIPE_CONNECT_RETURN_URL || 'https://halforder.app/restaurant-dashboard';
const connectRefreshUrl = process.env.STRIPE_CONNECT_REFRESH_URL || connectReturnUrl;

let adminApp;
function getFirebaseAdmin() {
  if (adminApp) return adminApp;
  try {
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    adminApp = admin;
    return admin;
  } catch (e) {
    console.warn('[stripe server] firebase-admin unavailable:', e?.message || e);
    return null;
  }
}

async function verifyBearerUid(req) {
  const admin = getFirebaseAdmin();
  if (!admin) return null;
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded && typeof decoded.uid === 'string' ? decoded.uid : null;
  } catch (e) {
    console.warn('[stripe server] verifyIdToken failed:', e?.message || e);
    return null;
  }
}

/**
 * POST /create-stripe-account
 * Body: { userId?: string, restaurantId?: string } (defaults to token uid; both must match token)
 * Header: Authorization: Bearer <Firebase ID token>
 *
 * Creates Stripe Connect Express account if needed, saves `restaurants/{uid}`, returns Account Link URL.
 * Production mobile app should prefer Firebase Callable `startRestaurantStripeConnect` (same logic).
 */
app.post('/create-stripe-account', async (req, res) => {
  try {
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe server is not configured' });
    }
    const uid = await verifyBearerUid(req);
    if (!uid) {
      return res.status(401).json({
        error: 'Unauthorized',
        hint: 'Send Authorization: Bearer <Firebase ID token>. Ensure firebase-admin can initialize (e.g. GOOGLE_APPLICATION_CREDENTIALS).',
      });
    }
    const bodyUser =
      typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    const bodyRestaurant =
      typeof req.body?.restaurantId === 'string' ? req.body.restaurantId.trim() : '';
    const restaurantId = bodyUser || bodyRestaurant || uid;
    if (restaurantId !== uid) {
      return res.status(403).json({ error: 'userId must match signed-in user' });
    }
    const admin = getFirebaseAdmin();
    if (!admin) {
      return res.status(503).json({
        error: 'Firebase Admin not available on this server process',
      });
    }
    const db = admin.firestore();
    const ref = db.doc(`restaurants/${restaurantId}`);
    const snap = await ref.get();
    let accountId =
      snap.exists && typeof snap.get('stripeAccountId') === 'string'
        ? snap.get('stripeAccountId')
        : '';
    if (!accountId || !String(accountId).startsWith('acct_')) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { firebaseRestaurantId: restaurantId },
      });
      accountId = account.id;
      await ref.set(
        {
          stripeAccountId: accountId,
          stripeConnected: false,
          stripeOnboardingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: connectReturnUrl,
      refresh_url: connectRefreshUrl,
    });
    if (!link?.url) {
      return res.status(500).json({ error: 'Stripe did not return an onboarding URL' });
    }
    return res.json({ url: link.url, accountId });
  } catch (error) {
    console.error('[POST /create-stripe-account]', error);
    return res.status(500).json({ error: error?.message || 'Failed to create Stripe Connect onboarding' });
  }
});

/**
 * POST /resume-stripe-onboarding
 * Requires an existing `stripeAccountId`; returns a fresh Account Link URL.
 */
app.post('/resume-stripe-onboarding', async (req, res) => {
  try {
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe server is not configured' });
    }
    const uid = await verifyBearerUid(req);
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const bodyUser =
      typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    const bodyRestaurant =
      typeof req.body?.restaurantId === 'string' ? req.body.restaurantId.trim() : '';
    const restaurantId = bodyUser || bodyRestaurant || uid;
    if (restaurantId !== uid) {
      return res.status(403).json({ error: 'userId must match signed-in user' });
    }
    const admin = getFirebaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: 'Firebase Admin not available' });
    }
    const snap = await admin.firestore().doc(`restaurants/${restaurantId}`).get();
    const accountId =
      snap.exists && typeof snap.get('stripeAccountId') === 'string'
        ? snap.get('stripeAccountId')
        : '';
    if (!accountId || !String(accountId).startsWith('acct_')) {
      return res.status(400).json({ error: 'No Stripe Connect account yet. Use POST /create-stripe-account first.' });
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: connectReturnUrl,
      refresh_url: connectRefreshUrl,
    });
    if (!link?.url) {
      return res.status(500).json({ error: 'Stripe did not return an onboarding URL' });
    }
    return res.json({ url: link.url, accountId });
  } catch (error) {
    console.error('[POST /resume-stripe-onboarding]', error);
    return res.status(500).json({ error: error?.message || 'Failed to resume Stripe onboarding' });
  }
});

/**
 * GET /stripe-status?userId=<uid> (or restaurantId=<uid>)
 * Returns live Stripe Connect flags and syncs summary fields on `restaurants/{id}`.
 */
app.get('/stripe-status', async (req, res) => {
  try {
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe server is not configured' });
    }
    const uid = await verifyBearerUid(req);
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const q = req.query?.userId ?? req.query?.restaurantId;
    const restaurantId = typeof q === 'string' && q.trim() ? q.trim() : uid;
    if (restaurantId !== uid) {
      return res.status(403).json({ error: 'userId must match signed-in user' });
    }
    const admin = getFirebaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: 'Firebase Admin not available' });
    }
    const ref = admin.firestore().doc(`restaurants/${restaurantId}`);
    const snap = await ref.get();
    const accountId =
      snap.exists && typeof snap.get('stripeAccountId') === 'string'
        ? snap.get('stripeAccountId')
        : '';
    if (!accountId || !String(accountId).startsWith('acct_')) {
      return res.json({
        hasAccount: false,
        stripeConnected: false,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });
    }
    const account = await stripe.accounts.retrieve(accountId);
    const charges_enabled = account.charges_enabled === true;
    const payouts_enabled = account.payouts_enabled === true;
    const details_submitted = account.details_submitted === true;
    await ref.set(
      {
        stripeConnected: details_submitted,
        stripeChargesEnabled: charges_enabled,
        stripePayoutsEnabled: payouts_enabled,
        stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return res.json({
      hasAccount: true,
      stripeConnected: details_submitted,
      charges_enabled,
      payouts_enabled,
      details_submitted,
    });
  } catch (error) {
    console.error('[GET /stripe-status]', error);
    return res.status(500).json({ error: error?.message || 'Failed to load Stripe status' });
  }
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { amount, orderId } = req.body || {};
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'Invalid orderId' });
    }
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe server is not configured' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: 'HalfOrder Payment',
            },
            unit_amount: Math.round(parsedAmount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      metadata: {
        orderId,
      },
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

const PORT = Number(process.env.STRIPE_PORT || 3001);

function logStripeServerLan(port) {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (v4 && !net.internal) ips.push(net.address);
    }
  }
  console.log(`[stripe server] Listening on 0.0.0.0:${port}`);
  ips.forEach((ip) => console.log(`[stripe server] http://${ip}:${port}`));
}

app.listen(PORT, '0.0.0.0', () => {
  logStripeServerLan(PORT);
});
