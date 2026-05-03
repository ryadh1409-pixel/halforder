import { API_BASE_URL, STRIPE_HTTP_ENABLED } from '@/frontend/config/api';
import { auth, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
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
  if (stripeHttpBase()) {
    const json = await httpGetStripeStatus(restaurantId);
    return parseStatus(json);
  }
  const callable = httpsCallable(functions, 'getRestaurantStripeStatus');
  const result = await callable({ restaurantId });
  return parseStatus((result.data ?? {}) as Record<string, unknown>);
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

export async function createStripeAccount(restaurantId: string): Promise<string> {
  const { accountId } = await connectWithStripeExpo(restaurantId);
  if (!accountId) {
    throw new Error('Stripe account id missing from server response');
  }
  return accountId;
}

export async function createOnboardingLink(restaurantId: string): Promise<string> {
  const { url } = await resumeStripeOnboardingExpo(restaurantId);
  return url;
}

export async function createCheckoutSession(params: {
  orderId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
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
  const callable = httpsCallable(functions, 'createConnectPaymentIntent');
  const result = await callable({ amount, accountId });
  const clientSecret = (result.data as { clientSecret?: unknown })?.clientSecret;
  if (typeof clientSecret !== 'string' || !clientSecret.includes('_secret_')) {
    throw new Error('Invalid payment intent response');
  }
  return clientSecret;
}
