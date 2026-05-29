import { httpsCallable } from 'firebase/functions';
import React from 'react';
import { auth, functions } from '@/services/firebase';
import { openWebCheckout } from '@/services/stripe.web';
import { updatePaymentOrderWithRetry } from '@/services/paymentFlowFirestore';

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
  const amount = Number(params.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer (in cents).');
  }

  const orderId = params.orderId?.trim() ?? '';
  if (!orderId) {
    throw new Error('orderId is required for web checkout');
  }

  assertNonAnonymousPaymentUser();
  await auth.currentUser?.getIdToken(true);

  const fn = httpsCallable(functions, 'createPaymentIntent');
  const result = await fn({
    amount,
    orderId,
    platform: 'web',
  });
  const data = result.data as Record<string, unknown> | undefined;
  const checkoutSessionId =
    typeof data?.checkoutSessionId === 'string' ? data.checkoutSessionId.trim() : '';

  if (!checkoutSessionId) {
    throw new Error('checkoutSessionId missing from createPaymentIntent response');
  }

  try {
    await updatePaymentOrderWithRetry({
      orderId,
      operation: 'set_processing',
      payload: {
        status: 'payment_processing',
        paymentStatus: 'processing',
        checkoutSessionId,
      },
    });
  } catch (e) {
    if (__DEV__) {
      console.warn(
        JSON.stringify({
          msg: 'payment_flow_processing_patch_failed',
          orderId,
          path: `orders/${orderId}`,
          operation: 'set_processing',
          uid: auth.currentUser?.uid ?? null,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  await openWebCheckout(checkoutSessionId);

  return {
    status: 'redirected',
    clientSecret: '',
    paymentIntentId: '',
    checkoutSessionId,
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
    isPlatformPaySupported: async () => false,
  };
}
