import {
  initPaymentSheet,
  presentPaymentSheet,
  StripeProvider,
  useStripe,
  type InitPaymentSheetResult,
  type PresentPaymentSheetResult,
} from '@stripe/stripe-react-native';
import { httpsCallable } from 'firebase/functions';
import React from 'react';
import { auth, db, functions } from '@/services/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

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
};

type OpenPaymentSheetResult =
  | ({ status: 'success' } & InitSheetResult)
  | ({ status: 'canceled' } & InitSheetResult)
  | ({ status: 'failed'; message: string } & InitSheetResult);

function parsePaymentIntentId(clientSecret: string): string {
  const idx = clientSecret.indexOf('_secret_');
  return idx > 0 ? clientSecret.slice(0, idx) : clientSecret;
}

export async function initializePaymentSheet(
  params: InitSheetParams,
): Promise<InitSheetResult> {
  const amount = Number(params.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer (in cents).');
  }

  assertNonAnonymousPaymentUser();
  await auth.currentUser?.getIdToken(true);

  const fn = httpsCallable(functions, 'createPaymentIntent');
  const result = await fn({ amount, orderId: params.orderId ?? null });
  const data = result.data as Record<string, unknown> | undefined;
  const clientSecret =
    typeof data?.clientSecret === 'string'
      ? data.clientSecret
      : typeof data?.client_secret === 'string'
        ? data.client_secret
        : undefined;

  if (!clientSecret) throw new Error('clientSecret missing');

  const initResult: InitPaymentSheetResult = await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: params.merchantDisplayName ?? 'Halforder',
    returnURL: 'halforder://stripe-redirect',
  });
  if (initResult.error) {
    throw new Error(`initPaymentSheet failed: ${initResult.error.message}`);
  }

  const paymentIntentId = parsePaymentIntentId(clientSecret);

  if (params.orderId) {
    try {
      await updateDoc(doc(db, 'orders', params.orderId), {
        status: 'payment_processing',
        paymentStatus: 'processing',
        paymentIntentId,
        stripePaymentIntentId: paymentIntentId,
        updatedAt: serverTimestamp(),
      });
      console.log(
        JSON.stringify({
          msg: 'payment_flow_sheet_initialized',
          orderId: params.orderId,
          paymentIntentId,
        }),
      );
    } catch (e) {
      console.warn(
        JSON.stringify({
          msg: 'payment_flow_processing_patch_failed',
          orderId: params.orderId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  return { clientSecret, paymentIntentId };
}

export async function openPaymentSheet(
  params: InitSheetParams,
): Promise<OpenPaymentSheetResult> {
  const init = await initializePaymentSheet(params);
  const presentResult: PresentPaymentSheetResult = await presentPaymentSheet();
  if (presentResult.error) {
    if (presentResult.error.code === 'Canceled') {
      return { status: 'canceled', ...init };
    }
    return {
      status: 'failed',
      message: presentResult.error.message || 'Payment failed.',
      ...init,
    };
  }
  return { status: 'success', ...init };
}

type StripeProviderProps = React.ComponentProps<typeof StripeProvider>;

export function AppStripeProvider(props: StripeProviderProps) {
  return <StripeProvider {...props} />;
}

export { useStripe };

