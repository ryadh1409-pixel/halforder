import { app } from '@/services/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions(app);

export async function createStripeAccount(): Promise<string> {
  const callable = httpsCallable(functions, 'createStripeAccount');
  const result = await callable();
  const accountId = (result.data as { accountId?: unknown })?.accountId;
  if (typeof accountId !== 'string' || !accountId.startsWith('acct_')) {
    throw new Error('Invalid Stripe account response');
  }
  return accountId;
}

export async function createOnboardingLink(accountId: string): Promise<string> {
  const callable = httpsCallable(functions, 'createOnboardingLink');
  const result = await callable({ accountId });
  const url = (result.data as { url?: unknown })?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Invalid onboarding link response');
  }
  return url;
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
