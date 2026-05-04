import { API_BASE_URL, STRIPE_HTTP_ENABLED } from '@/frontend/config/api';
import { auth, ensureAuthReady, functions } from '@/services/firebase';
import { createOnboardingLink as createOnboardingLinkCallable } from '@/services/stripeOnboarding';
import { requireAuthReady } from '@/services/authGuard';
import { getRestaurant } from '@/services/restaurantService';
import { httpsCallable } from 'firebase/functions';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform } from 'react-native';
import { apiFetch } from '@/utils/apiFetch';

function logStripeHttp(label: string, payload: unknown) {
  try {
    console.log(`[Stripe HTTP] ${label}`, typeof payload === 'string' ? payload : JSON.stringify(payload));
  } catch {
    console.log(`[Stripe HTTP] ${label}`, payload);
  }
}

function stripeHttpBase(): string | null {
  if (!STRIPE_HTTP_ENABLED) return null;
  const base = API_BASE_URL.replace(/\/$/, '').trim();
  if (!base) return null;
  if (__DEV__ && Platform.OS !== 'web' && /localhost|127\.0\.0\.1/i.test(base)) {
    console.warn(
      '[Stripe] API_BASE_URL points at localhost — use your LAN IP (see frontend/config/api.ts or EXPO_PUBLIC_STRIPE_API_URL).',
    );
  }
  return base;
}

/** Opens Stripe Connect onboarding inside the app (SFSafariViewController / Chrome Custom Tabs). */
export async function openStripeConnectInApp(url: string): Promise<void> {
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Invalid Stripe URL');
  }
  const result = await WebBrowser.openBrowserAsync(url);
  logStripeHttp('WebBrowser closed', result);
}

async function getIdToken(): Promise<string> {
  await requireAuthReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

/** POST /create-stripe-account — Express (only when STRIPE_HTTP_ENABLED). */
async function httpPostStripe(path: string, body: Record<string, unknown>) {
  const base = stripeHttpBase();
  if (!base) {
    throw new Error(
      'Stripe HTTP is disabled (EXPO_PUBLIC_STRIPE_HTTP_DISABLED=1) or API_BASE_URL is empty. Enable HTTP or use Firebase callables.',
    );
  }
  const idToken = await getIdToken();
  const url = `${base}${path}`;
  logStripeHttp(`POST ${path} request body`, body);
  const res = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    logStripeHttp(`POST ${path} error`, { status: res.status, body: json });
    const err = typeof json.error === 'string' ? json.error : 'Stripe request failed';
    throw new Error(err);
  }
  logStripeHttp(`POST ${path} ok`, json);
  return json;
}

/** GET `${API_BASE_URL}/stripe-status/:userId` (legacy `?userId=` on 404). */
async function httpGetStripeStatus(userId: string) {
  const base = stripeHttpBase();
  if (!base) {
    throw new Error(
      'Stripe HTTP is disabled or API_BASE_URL is empty. Set frontend/config/api.ts or EXPO_PUBLIC_STRIPE_API_URL.',
    );
  }
  const idToken = await getIdToken();
  const primary = `${base}/stripe-status/${encodeURIComponent(userId)}`;
  logStripeHttp('GET stripe-status request', { userId });
  let res = await apiFetch(primary, {
    method: 'GET',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) {
    const q = new URLSearchParams({ userId }).toString();
    const legacy = `${base}/stripe-status?${q}`;
    logStripeHttp('GET stripe-status retry (legacy query)', { legacy });
    res = await apiFetch(legacy, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
    });
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    logStripeHttp('GET stripe-status error', { status: res.status, body: json });
    const err = typeof json.error === 'string' ? json.error : 'Stripe status request failed';
    throw new Error(err);
  }
  logStripeHttp('GET stripe-status ok', json);
  return json;
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

function parseStatus(json: Record<string, unknown>): StripeConnectStatus {
  /** Minimal backend: `{ connected }` === Stripe `charges_enabled`. */
  if (typeof json.connected === 'boolean') {
    const c = json.connected;
    return {
      hasAccount: c,
      stripeConnected: c,
      charges_enabled: c,
      payouts_enabled: c,
      details_submitted: c,
    };
  }
  const details_submitted = Boolean(json.details_submitted);
  const stripeConnected =
    typeof json.stripeConnected === 'boolean' ? json.stripeConnected : details_submitted;
  return {
    hasAccount: json.hasAccount === true,
    stripeConnected,
    charges_enabled: Boolean(json.charges_enabled),
    payouts_enabled: Boolean(json.payouts_enabled),
    details_submitted,
  };
}

/** POST /create-stripe-account (HTTP) or Firebase callable fallback. */
export async function connectWithStripeExpo(
  restaurantId: string,
): Promise<StripeConnectOnboardingResult> {
  await requireAuthReady();
  if (stripeHttpBase()) {
    const user = auth.currentUser;
    if (!user?.uid) throw new Error('Not signed in');
    const json = await httpPostStripe('/create-stripe-account', { userId: user.uid });
    return parseOnboarding(json);
  }
  const callable = httpsCallable(functions, 'startRestaurantStripeConnect');
  const result = await callable({ restaurantId });
  return parseOnboarding((result.data ?? {}) as Record<string, unknown>);
}

/** POST /resume-stripe-onboarding (HTTP) or Firebase callable fallback. */
export async function resumeStripeOnboardingExpo(
  restaurantId: string,
): Promise<StripeConnectOnboardingResult> {
  await requireAuthReady();
  if (stripeHttpBase()) {
    const user = auth.currentUser;
    if (!user?.uid) throw new Error('Not signed in');
    const json = await httpPostStripe('/resume-stripe-onboarding', { userId: user.uid });
    return parseOnboarding(json);
  }
  const callable = httpsCallable(functions, 'resumeRestaurantStripeOnboarding');
  const result = await callable({ restaurantId });
  return parseOnboarding((result.data ?? {}) as Record<string, unknown>);
}

/** GET /stripe-status (HTTP) or Firebase callable fallback. */
export async function fetchStripeConnectStatusExpo(
  restaurantId: string,
): Promise<StripeConnectStatus> {
  await requireAuthReady();
  if (stripeHttpBase()) {
    const json = await httpGetStripeStatus(restaurantId);
    return parseStatus(json);
  }
  const callable = httpsCallable(functions, 'getRestaurantStripeStatus');
  const result = await callable({ restaurantId });
  return parseStatus((result.data ?? {}) as Record<string, unknown>);
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

/** Creates (or returns existing) Stripe Express Connect account; persists `stripeAccountId` on `restaurants/{id}`. */
export async function createStripeAccount(restaurantId: string): Promise<string> {
  await requireAuthReady();
  const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (!rid) throw new Error('restaurantId required');
  if (stripeHttpBase()) {
    const { accountId, url } = await connectWithStripeExpo(rid);
    if (typeof accountId === 'string' && accountId.startsWith('acct_')) {
      return accountId;
    }
    if (typeof url === 'string' && url.startsWith('http')) {
      throw new Error(
        'HTTP Stripe API returned onboarding URL without accountId; use startOnboarding() or enable Firebase callables.',
      );
    }
    throw new Error('Stripe account id missing from server response');
  }
  const callable = httpsCallable(functions, 'createStripeAccount');
  const result = await callable({ restaurantId: rid });
  const id = (result.data as { accountId?: unknown })?.accountId;
  if (typeof id !== 'string' || !id.startsWith('acct_')) {
    throw new Error('Invalid createStripeAccount response');
  }
  return id;
}

/** Account Links onboarding URL; optional `accountId` must match Firestore when both are set. */
export async function createOnboardingLink(
  restaurantId: string,
  accountId?: string,
): Promise<string> {
  await requireAuthReady();
  const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (!rid) throw new Error('restaurantId required');
  if (stripeHttpBase()) {
    const { url } = await resumeStripeOnboardingExpo(rid);
    return url;
  }
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
 * Restaurant Connect: ensure Express account exists, then open Stripe onboarding in the in-app browser.
 * When Stripe HTTP API is enabled, uses the existing one-shot HTTP flow (same end result).
 */
export async function startOnboarding(restaurantId?: string): Promise<void> {
  try {
    await ensureAuthReady();
    if (!auth.currentUser?.uid) throw new Error('Not signed in');
    console.log('USER:', auth.currentUser.uid);

    const user = auth.currentUser;
    const rid = (restaurantId ?? user.uid).trim();
    if (!rid) throw new Error('restaurantId required');
    if (rid !== user.uid) {
      throw new Error('restaurantId must match the signed-in user');
    }

    if (stripeHttpBase()) {
      const { url } = await connectWithStripeExpo(rid);
      await WebBrowser.openBrowserAsync(url);
      logStripeHttp('startOnboarding (HTTP) browser closed', 'done');
      return;
    }

    const url = await createOnboardingLinkCallable();
    await WebBrowser.openBrowserAsync(url);
    logStripeHttp('startOnboarding (callable) browser closed', 'done');
  } catch (error) {
    console.error('Stripe error:', error);
    const msg = error instanceof Error ? error.message : 'Something went wrong';
    Alert.alert('Stripe', msg || 'Something went wrong');
    throw error;
  }
}

/**
 * Owner-only Connect status check used by onboarding UI.
 * Backend also syncs `stripeReady` on the restaurant doc.
 */
export async function checkStripeStatus(restaurantId?: string): Promise<StripeAccountStatus> {
  await ensureAuthReady();
  if (!auth.currentUser?.uid) throw new Error('Not signed in');
  const user = auth.currentUser;
  const rid = (restaurantId ?? user.uid).trim();
  if (!rid) throw new Error('restaurantId required');
  if (rid !== user.uid) {
    throw new Error('restaurantId must match the signed-in user');
  }
  const callable = httpsCallable(functions, 'checkStripeStatus');
  const result = await callable({ restaurantId: rid });
  const data = (result.data ?? {}) as {
    charges_enabled?: unknown;
    details_submitted?: unknown;
    ready?: unknown;
  };
  return {
    charges_enabled: data.charges_enabled === true,
    details_submitted: data.details_submitted === true,
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
  await requireAuthReady();
  const callable = httpsCallable(functions, 'createConnectPaymentIntent');
  const result = await callable({ amount, accountId });
  const clientSecret = (result.data as { clientSecret?: unknown })?.clientSecret;
  if (typeof clientSecret !== 'string' || !clientSecret.includes('_secret_')) {
    throw new Error('Invalid payment intent response');
  }
  return clientSecret;
}
