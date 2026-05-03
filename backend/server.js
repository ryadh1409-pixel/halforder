/**
 * Stripe Connect API (Express + Firebase Admin).
 * GET  /              — plain-text probe
 * GET  /health        — JSON health check
 * POST /create-stripe-account  body: { userId }
 * GET  /stripe-status/:userId
 * POST /resume-stripe-onboarding body: { userId }
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const Stripe = require('stripe');

const PORT = Number(process.env.PORT) || 3000;
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const refreshUrl = process.env.STRIPE_REFRESH_URL || 'https://example.com/reauth';
const returnUrl = process.env.STRIPE_RETURN_URL || 'https://example.com/success';

if (!stripeSecret) {
  console.warn('[backend] STRIPE_SECRET_KEY is not set.');
}

const stripe = new Stripe(stripeSecret || '', {
  apiVersion: '2024-06-20',
});

/**
 * Initialize Firebase Admin once.
 * Order: ./serviceAccountKey.json → FIREBASE_SERVICE_ACCOUNT_JSON → ADC.
 */
function initFirebaseAdmin() {
  if (admin.apps.length) {
    return;
  }
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('[backend] Firebase Admin initialized from serviceAccountKey.json');
    return;
  }
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    admin.initializeApp({ credential: admin.credential.cert(parsed) });
    console.log('[backend] Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
    return;
  }
  admin.initializeApp();
  console.log('[backend] Firebase Admin initialized (application default credentials)');
}

initFirebaseAdmin();
const db = admin.firestore();

function requireUserId(userId) {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Missing userId');
  }
  return userId.trim();
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.type('text/plain').send('Server is working ✅');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is healthy',
    timestamp: new Date().toISOString(),
  });
});

async function verifyBearerUid(req) {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return typeof decoded.uid === 'string' ? decoded.uid : null;
  } catch (e) {
    console.warn('[backend] verifyIdToken failed:', e?.message || e);
    return null;
  }
}

async function mirrorStripeToRestaurant(userId, patch) {
  try {
    await db.doc(`restaurants/${userId}`).set(patch, { merge: true });
  } catch (e) {
    console.warn('[backend] mirror restaurants failed:', e?.message || e);
  }
}

/**
 * POST /create-stripe-account
 * Body: { userId: string }
 */
app.post('/create-stripe-account', async (req, res) => {
  try {
    console.log('Incoming request:', req.body);
    if (!stripeSecret) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured' });
    }
    const uid = await verifyBearerUid(req);
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = requireUserId(
      typeof req.body?.userId === 'string' && req.body.userId.trim()
        ? req.body.userId.trim()
        : uid,
    );
    if (userId !== uid) {
      return res.status(403).json({ error: 'userId must match signed-in user' });
    }

    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();
    let accountId =
      snap.exists && typeof snap.get('stripeAccountId') === 'string'
        ? snap.get('stripeAccountId')
        : '';

    if (!accountId || !String(accountId).startsWith('acct_')) {
      const account = await stripe.accounts.create({
        type: 'express',
      });
      accountId = account.id;
      await db.collection('users').doc(userId).set(
        {
          stripeAccountId: accountId,
          stripeConnected: false,
          stripeOnboardingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await mirrorStripeToRestaurant(userId, {
        stripeAccountId: accountId,
        stripeConnected: false,
        stripeChargesEnabled: false,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    if (!accountLink?.url) {
      return res.status(500).json({ error: 'Stripe did not return an onboarding URL' });
    }
    return res.json({ url: accountLink.url });
  } catch (err) {
    console.error('Stripe / Firestore error:', err);
    return res.status(500).json({
      error: err?.message || 'Failed to create Stripe Connect onboarding',
    });
  }
});

/**
 * POST /resume-stripe-onboarding
 * Body: { userId: string }
 */
app.post('/resume-stripe-onboarding', async (req, res) => {
  try {
    console.log('Incoming request:', req.body);
    if (!stripeSecret) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured' });
    }
    const uid = await verifyBearerUid(req);
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = requireUserId(
      typeof req.body?.userId === 'string' && req.body.userId.trim()
        ? req.body.userId.trim()
        : uid,
    );
    if (userId !== uid) {
      return res.status(403).json({ error: 'userId must match signed-in user' });
    }

    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();
    let accountId =
      snap.exists && typeof snap.get('stripeAccountId') === 'string'
        ? snap.get('stripeAccountId')
        : '';
    if (!accountId || !String(accountId).startsWith('acct_')) {
      const restSnap = await db.doc(`restaurants/${userId}`).get();
      accountId =
        restSnap.exists && typeof restSnap.get('stripeAccountId') === 'string'
          ? restSnap.get('stripeAccountId')
          : '';
    }
    if (!accountId || !String(accountId).startsWith('acct_')) {
      return res.status(400).json({
        error: 'No Stripe Connect account yet. Use POST /create-stripe-account first.',
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    if (!accountLink?.url) {
      return res.status(500).json({ error: 'Stripe did not return an onboarding URL' });
    }
    return res.json({ url: accountLink.url });
  } catch (err) {
    console.error('Stripe / Firestore error:', err);
    return res.status(500).json({
      error: err?.message || 'Failed to resume Stripe onboarding',
    });
  }
});

/**
 * GET /stripe-status/:userId
 * Returns { connected: boolean } where connected === Stripe charges_enabled.
 */
app.get('/stripe-status/:userId', async (req, res) => {
  try {
    console.log('Incoming request:', { params: req.params });
    if (!stripeSecret) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured' });
    }
    const uid = await verifyBearerUid(req);
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const rawUserId =
      typeof req.params?.userId === 'string' && req.params.userId.trim()
        ? req.params.userId.trim()
        : '';
    if (!rawUserId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    const userId = requireUserId(rawUserId);
    if (userId !== uid) {
      return res.status(403).json({ error: 'userId must match signed-in user' });
    }

    const userRef = db.collection('users').doc(userId);
    const uSnap = await userRef.get();
    let accountId =
      uSnap.exists && typeof uSnap.get('stripeAccountId') === 'string'
        ? uSnap.get('stripeAccountId')
        : '';
    if (!accountId || !String(accountId).startsWith('acct_')) {
      const restSnap = await db.doc(`restaurants/${userId}`).get();
      accountId =
        restSnap.exists && typeof restSnap.get('stripeAccountId') === 'string'
          ? restSnap.get('stripeAccountId')
          : '';
    }

    if (!accountId || !String(accountId).startsWith('acct_')) {
      return res.json({ connected: false });
    }

    const account = await stripe.accounts.retrieve(accountId);
    const chargesEnabled = account.charges_enabled === true;

    if (chargesEnabled) {
      const patch = {
        stripeConnected: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: account.payouts_enabled === true,
        stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await db.collection('users').doc(userId).set(patch, { merge: true });
      await mirrorStripeToRestaurant(userId, patch);
    }

    return res.json({ connected: chargesEnabled });
  } catch (err) {
    console.error('Stripe / Firestore error:', err);
    return res.status(500).json({
      error: err?.message || 'Failed to load Stripe status',
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

function logLanAddresses(port) {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (v4 && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  if (ips.length === 0) {
    console.log('[backend] No non-internal IPv4 found — check network or use ifconfig/ipconfig');
    return;
  }
  ips.forEach((ip) => {
    console.log(`[backend] LAN: http://${ip}:${port}`);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  logLanAddresses(PORT);
});
