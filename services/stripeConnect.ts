import { app } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions(app);

export async function createStripeAccount(restaurantId: string): Promise<string> {
  const callable = httpsCallable(functions, 'createStripeAccount');
  const result = await callable({ restaurantId });
  const accountId = (result.data as { accountId?: unknown })?.accountId;
  if (typeof accountId !== 'string' || !accountId.startsWith('acct_')) {
    throw new Error('Invalid Stripe account response');
  }
  return accountId;
}

export async function createOnboardingLink(restaurantId: string): Promise<string> {
  const callable = httpsCallable(functions, 'createOnboardingLink');
  const result = await callable({ restaurantId });
  const url = (result.data as { url?: unknown })?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Invalid onboarding link response');
  }
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
  const callable = httpsCallable(functions, 'createPaymentIntent');
  const result = await callable({ amount, accountId });
  const clientSecret = (result.data as { clientSecret?: unknown })?.clientSecret;
  if (typeof clientSecret !== 'string' || !clientSecret.includes('_secret_')) {
    throw new Error('Invalid payment intent response');
  }
  return clientSecret;
}
