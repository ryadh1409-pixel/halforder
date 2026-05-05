import { requireAuthReady } from '@/services/authGuard';
import {
  auth,
  db,
  ensureAuthReady,
  functions,
} from '@/services/firebase';
import { getRestaurant } from '@/services/restaurantService';
import {
  createPaymentIntent as createPaymentIntentService,
  startStripeOnboarding,
} from '@/services/stripe';
import * as WebBrowser from 'expo-web-browser';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

function logStripe(label: string, payload: unknown) {
  try {
    console.log(`[Stripe] ${label}`, typeof payload === 'string' ? payload : JSON.stringify(payload));
  } catch {
    console.log(`[Stripe] ${label}`, payload);
  }
}

/** Opens Stripe Connect onboarding inside the app (SFSafariViewController / Chrome Custom Tabs). */
export async function openStripeConnectInApp(url: string): Promise<void> {
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Invalid Stripe URL');
  }
  const result = await WebBrowser.openBrowserAsync(url);
  logStripe('WebBrowser closed', result);
}

export type StripeConnectOnboardingResult = { url: string; accountId?: string };

export type StripeConnectStatus = {
  hasAccount: boolean;
  /** Firestore `stripeConnected` — details submitted in Stripe onboarding. */
  stripeConnected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

export type StripeAccountStatus = {
  charges_enabled: boolean;
  details_submitted: boolean;
};

function parseOnboarding(json: Record<string, unknown>): StripeConnectOnboardingResult {
  const url = json.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Invalid onboarding URL from server');
  }
  const accountId = json.accountId;
  if (typeof accountId === 'string' && accountId.startsWith('acct_')) {
    return { url, accountId };
  }
  return { url };
}

async function ensureHostStripeDocsInitialized(uid: string): Promise<void> {
  const usersRef = doc(db, 'users', uid);
  const restaurantsRef = doc(db, 'restaurants', uid);

  const [userSnap, restaurantSnap] = await Promise.all([
    getDoc(usersRef),
    getDoc(restaurantsRef),
  ]);

  if (!restaurantSnap.exists()) {
    throw new Error(
      'Your host/restaurant profile is not initialized yet. Complete restaurant setup first.',
    );
  }

  if (!userSnap.exists()) {
    await setDoc(
      usersRef,
      {
        stripeAccountId: null,
        stripeOnboardingComplete: false,
      },
      { merge: true },
    );
  }
}

/** Cloud Functions `checkStripeStatus` (GET + Bearer). */
function parseHostCheckStatus(json: Record<string, unknown>): StripeConnectStatus {
  const charges = json.charges_enabled === true;
  const details = json.details_submitted === true;
  const onboardingComplete = json.stripeOnboardingComplete === true || charges;
  return {
    hasAccount: json.hasAccount === true,
    stripeConnected: onboardingComplete || details,
    charges_enabled: charges,
    payouts_enabled: charges,
    details_submitted: details,
  };
}

/** Firebase Callable `createStripeAccount` (v2, auth required). */
async function callableCreateStripeAccount(): Promise<StripeConnectOnboardingResult> {
  await requireAuthReady();
  if (!auth.currentUser?.uid) throw new Error('Not signed in');
  console.log('AUTH UID:', auth.currentUser.uid);
  const result = (await startStripeOnboarding()) as Record<string, unknown>;
  logStripe('callable createStripeAccount ok', {});
  return parseOnboarding(result);
}

/** Firebase Callable `checkStripeStatus` (v2, auth required). */
async function callableCheckStripeStatus(): Promise<StripeConnectStatus> {
  await requireAuthReady();
  if (!auth.currentUser?.uid) throw new Error('Not signed in');
  const fn = httpsCallable(functions, 'checkStripeStatus');
  const result = await fn({});
  return parseHostCheckStatus((result.data ?? {}) as Record<string, unknown>);
}

/** Stripe Connect onboarding (callable only). */
export async function connectWithStripeExpo(
  restaurantId: string,
): Promise<StripeConnectOnboardingResult> {
  await requireAuthReady();
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Not signed in');
  const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (rid && rid !== user.uid) {
    throw new Error('restaurantId must match signed-in user');
  }
  return callableCreateStripeAccount();
}

/** Stripe Connect onboarding resume (callable only). */
export async function resumeStripeOnboardingExpo(
  restaurantId: string,
): Promise<StripeConnectOnboardingResult> {
  await requireAuthReady();
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Not signed in');
  const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (rid && rid !== user.uid) {
    throw new Error('restaurantId must match signed-in user');
  }
  return callableCreateStripeAccount();
}

/** Stripe status sync (callable only). */
export async function fetchStripeConnectStatusExpo(
  restaurantId: string,
): Promise<StripeConnectStatus> {
  await requireAuthReady();
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Not signed in');
  const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (rid && rid !== user.uid) {
    throw new Error('restaurantId must match signed-in user');
  }
  return callableCheckStripeStatus();
}

/** Customer-safe: can this restaurant accept Stripe Checkout (Connect onboarding complete)? */
export async function fetchRestaurantCheckoutEligibility(restaurantId: string): Promise<boolean> {
  const id = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (!id) return false;
  try {
    await ensureAuthReady();
    if (!auth.currentUser) return false;
    const callable = httpsCallable(functions, 'getRestaurantCheckoutEligibility');
    const result = await callable({ restaurantId: id });
    const data = (result.data ?? {}) as { ready?: unknown };
    return data.ready === true;
  } catch (error) {
    console.error('Stripe error:', error);
    return false;
  }
}

/**
 * Prefer `restaurants/{id}.stripeReady` (and legacy Stripe flags) from Firestore; fall back to
 * `getRestaurantCheckoutEligibility` when the client cannot read the doc (e.g. rules) or doc is missing.
 */
export async function resolveRestaurantPaymentsReady(restaurantId: string): Promise<boolean> {
  const id = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (!id) return false;
  try {
    await ensureAuthReady();
    if (!auth.currentUser) return false;
    const profile = await getRestaurant(id);
    if (profile) {
      if (profile.stripeReady === true) return true;
      if (
        profile.stripeChargesEnabled === true &&
        profile.stripeDetailsSubmitted === true
      ) {
        return true;
      }
      return false;
    }
  } catch (e) {
    console.warn(
      '[stripe] resolveRestaurantPaymentsReady: Firestore read failed, using callable',
      e,
    );
  }
  return fetchRestaurantCheckoutEligibility(id);
}

/** @deprecated Prefer `connectWithStripeExpo`. */
export async function startRestaurantStripeConnect(
  restaurantId: string,
): Promise<StripeConnectOnboardingResult> {
  return connectWithStripeExpo(restaurantId);
}

/** @deprecated Prefer `connectWithStripeExpo` over raw HTTP helper. */
export async function startRestaurantStripeConnectHttp(
  restaurantId: string,
): Promise<StripeConnectOnboardingResult> {
  return connectWithStripeExpo(restaurantId);
}

/** Creates (or returns existing) Stripe Express Connect account; persists `stripeAccountId` on `users/{uid}` (server + client). */
export async function createStripeAccount(restaurantId: string): Promise<string> {
  await requireAuthReady();
  const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (!rid) throw new Error('restaurantId required');
  const { accountId } = await callableCreateStripeAccount();
  if (typeof accountId !== 'string' || !accountId.startsWith('acct_')) {
    throw new Error('Invalid createStripeAccount response');
  }
  return accountId;
}

/** Account Links onboarding URL; optional `accountId` must match Firestore when both are set. */
export async function createOnboardingLink(
  restaurantId: string,
  accountId?: string,
): Promise<string> {
  await requireAuthReady();
  const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (!rid) throw new Error('restaurantId required');
  const payload: { restaurantId: string; accountId?: string } = { restaurantId: rid };
  const aid = typeof accountId === 'string' ? accountId.trim() : '';
  if (aid) payload.accountId = aid;
  const callable = httpsCallable(functions, 'createOnboardingLink');
  const result = await callable(payload);
  const url = (result.data as { url?: unknown })?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Invalid onboarding URL from server');
  }
  return url;
}

/**
 * Restaurant Connect: create or resume Stripe Express onboarding link and persist `stripeAccountId`
 * on `users/{uid}`. Caller opens the returned URL.
 */
export async function startOnboarding(
  restaurantId?: string,
): Promise<StripeConnectOnboardingResult> {
  await requireAuthReady();
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Not signed in');
  const rid = (restaurantId ?? user.uid).trim();
  if (rid !== user.uid) {
    throw new Error('restaurantId must match signed-in user');
  }

  await ensureHostStripeDocsInitialized(user.uid);

  const result = await callableCreateStripeAccount();

  const { url, accountId } = result;
  if (typeof accountId === 'string' && accountId.startsWith('acct_')) {
    await setDoc(doc(db, 'users', user.uid), { stripeAccountId: accountId }, { merge: true });
  }
  return { url, accountId };
}

/**
 * Owner-only Connect status check used by onboarding UI.
 * Backend also syncs `stripeReady` on the restaurant doc.
 */
export async function checkStripeStatus(restaurantId?: string): Promise<StripeAccountStatus> {
  await requireAuthReady();
  if (!auth.currentUser?.uid) throw new Error('Not signed in');
  const user = auth.currentUser;
  const rid = (restaurantId ?? user.uid).trim();
  if (!rid) throw new Error('restaurantId required');
  if (rid !== user.uid) {
    throw new Error('restaurantId must match the signed-in user');
  }
  const status = await callableCheckStripeStatus();
  const data = status;
  return {
    charges_enabled: data.charges_enabled,
    details_submitted: data.details_submitted,
  };
}

export async function createCheckoutSession(params: {
  orderId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  await requireAuthReady();
  const callable = httpsCallable(functions, 'createCheckoutSession');
  const result = await callable({
    orderId: params.orderId,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });
  const data = result.data as { url?: unknown; sessionId?: unknown };
  const url = data.url;
  const sessionId = data.sessionId;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Invalid checkout session response');
  }
  if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    throw new Error('Invalid checkout session id');
  }
  return { url, sessionId };
}

export async function createPaymentIntent(
  amount: number,
  accountId: string,
): Promise<string> {
  void accountId;
  const data = (await createPaymentIntentService(amount)) as {
    clientSecret?: unknown;
  };
  const clientSecret = data?.clientSecret;
  if (typeof clientSecret !== 'string' || !clientSecret.includes('_secret_')) {
    throw new Error('Invalid payment intent response');
  }
  return clientSecret;
}
