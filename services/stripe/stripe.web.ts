import { httpsCallable } from 'firebase/functions';
import React from 'react';
import { auth, functions } from '@/services/firebase';
import { openWebCheckout } from '@/services/stripeWebCheckout';

const SIGN_IN_REQUIRED_ERROR = 'Please sign in to complete payment';

function assertNonAnonymousPaymentUser(): void {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    if (currentUser?.isAnonymous) void auth.signOut();
    throw new Error(SIGN_IN_REQUIRED_ERROR);
  }
}

type InitSheetParams = {
  amount: number;
  merchantDisplayName?: string;
  orderId?: string;
};

type InitSheetResult = {
  clientSecret: string;
  paymentIntentId: string;
  checkoutSessionId?: string;
  checkoutUrl?: string;
};

type OpenPaymentSheetResult =
  | ({ status: 'success' } & InitSheetResult)
  | ({ status: 'redirected' } & InitSheetResult)
  | ({ status: 'canceled' } & InitSheetResult)
  | ({ status: 'failed'; message: string } & InitSheetResult);

export async function initializePaymentSheet(
  params: InitSheetParams,
): Promise<InitSheetResult> {
  return openPaymentSheet(params);
}

export async function openPaymentSheet(
  params: InitSheetParams,
): Promise<OpenPaymentSheetResult> {
  const STRIPE_MIN_AMOUNT_CENTS = 50;
  const amountCents = Number(params.amount);
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('Amount must be a non-negative integer (in cents).');
  }

  const chargeAmountCents =
    amountCents === 0
      ? 0
      : Math.max(amountCents, STRIPE_MIN_AMOUNT_CENTS);

  const orderId = params.orderId?.trim() ?? '';
  if (!orderId) {
    throw new Error('orderId is required for web checkout');
  }

  assertNonAnonymousPaymentUser();
  await auth.currentUser?.getIdToken(true);

  const fn = httpsCallable(functions, 'createPaymentIntent');
  const result = await fn({
    amount: chargeAmountCents,
    orderId,
    platform: 'web',
  });
  const data = result.data as Record<string, unknown> | undefined;

  if (data?.zeroAmountPaid === true) {
    const paymentIntentId =
      typeof data?.paymentIntentId === 'string' && data.paymentIntentId.trim()
        ? data.paymentIntentId.trim()
        : `free_${orderId}`;
    return {
      status: 'success',
      clientSecret: '',
      paymentIntentId,
    };
  }

  const checkoutUrl = typeof data?.checkoutUrl === 'string' ? data.checkoutUrl.trim() : '';
  const checkoutSessionId =
    typeof data?.checkoutSessionId === 'string' ? data.checkoutSessionId.trim() : '';

  if (!checkoutUrl) {
    throw new Error('checkoutUrl missing from createPaymentIntent response');
  }

  if (!checkoutSessionId) {
    throw new Error('checkoutSessionId missing from createPaymentIntent response');
  }

  openWebCheckout(checkoutUrl);

  return {
    status: 'redirected',
    clientSecret: '',
    paymentIntentId: '',
    checkoutSessionId,
    checkoutUrl,
  };
}

type WebProviderProps = {
  children: React.ReactNode;
  publishableKey?: string;
  merchantIdentifier?: string;
  urlScheme?: string;
};

export function AppStripeProvider({ children }: WebProviderProps) {
  return children as React.ReactElement;
}

export function useStripe() {
  return {
    initPaymentSheet: async () => ({ error: null }),
    presentPaymentSheet: async () => ({ error: null }),
    isPlatformPaySupported: async () => false,
  };
}
