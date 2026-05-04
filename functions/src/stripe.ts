import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import Stripe from 'stripe';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const connectRefreshUrl = defineString('STRIPE_CONNECT_REFRESH_URL', {
  default: 'https://example.com/refresh',
});
const connectReturnUrl = defineString('STRIPE_CONNECT_RETURN_URL', {
  default: 'https://example.com/success',
});

const REGION = 'us-central1';

/**
 * Callable — create or reuse Stripe Express Connect account and return Account Link URL.
 * Auth: Firebase Auth only (`request.auth.uid`). No client-supplied user id is trusted.
 */
export const createStripeAccount = onCall(
  {
    region: REGION,
    secrets: [stripeSecretKey],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be logged in');
    }

    try {
      const stripe = new Stripe(stripeSecretKey.value());

      const db = admin.firestore();
      const userRef = db.doc(`users/${uid}`);
      const snap = await userRef.get();
      const d = snap.data();
      const existing = typeof d?.stripeAccountId === 'string' ? d.stripeAccountId.trim() : '';

      let accountId = existing.startsWith('acct_') ? existing : '';

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          metadata: { firebaseUid: uid },
        });
        accountId = account.id;
        await userRef.set(
          {
            stripeAccountId: accountId,
            stripeOnboardingComplete: false,
          },
          { merge: true },
        );
      }

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: connectRefreshUrl.value(),
        return_url: connectReturnUrl.value(),
        type: 'account_onboarding',
      });

      return {
        url: link.url,
        accountId,
      };
    } catch (e) {
      console.error('[createStripeAccount] failed', e);
      throw new HttpsError('internal', 'Stripe request failed');
    }
  },
);

/**
 * Callable — sync Stripe Connect status; sets `stripeOnboardingComplete` when `charges_enabled`.
 */
export const checkStripeStatus = onCall(
  {
    region: REGION,
    secrets: [stripeSecretKey],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be logged in');
    }

    const db = admin.firestore();
    const userRef = db.doc(`users/${uid}`);
    const snap = await userRef.get();
    const ud = snap.data();
    const accountId = typeof ud?.stripeAccountId === 'string' ? ud.stripeAccountId.trim() : '';

    if (!accountId.startsWith('acct_')) {
      return {
        charges_enabled: false,
        details_submitted: false,
        stripeOnboardingComplete: false,
        hasAccount: false,
      };
    }

    const stripe = new Stripe(stripeSecretKey.value());

    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(accountId);
    } catch (e) {
      console.error('[checkStripeStatus] Stripe retrieve failed', e);
      throw new HttpsError('internal', 'Could not load Stripe account');
    }

    const charges_enabled = account.charges_enabled === true;
    const details_submitted = account.details_submitted === true;

    if (charges_enabled) {
      await userRef.set({ stripeOnboardingComplete: true }, { merge: true });
    }

    return {
      charges_enabled,
      details_submitted,
      stripeOnboardingComplete: charges_enabled,
      hasAccount: true,
    };
  },
);
