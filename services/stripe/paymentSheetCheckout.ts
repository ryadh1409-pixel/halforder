import type { PaymentSheet } from '@stripe/stripe-react-native';
import { PaymentSheetError } from '@stripe/stripe-react-native';

import { createPaymentIntent } from '../stripePayment';
import {
  STRIPE_MERCHANT_DISPLAY_NAME,
  STRIPE_PAYMENT_SHEET_RETURN_URL,
} from './stripeCheckoutConstants';

export type PaymentSheetStripeActions = {
  initPaymentSheet: (params: PaymentSheet.SetupParams) => Promise<{ error?: { message?: string; code?: string } }>;
  presentPaymentSheet: () => Promise<{ error?: { message?: string; code?: string } }>;
};

/**
 * Fetches a PaymentIntent from the backend, initializes PaymentSheet, then presents it.
 * @returns `'success'` | `'canceled'` (user dismissed sheet)
 * @throws Error with user-safe message on failure
 */
export async function runPaymentSheetCheckout(
  amountCents: number,
  stripe: PaymentSheetStripeActions,
): Promise<'success' | 'canceled'> {
  const { clientSecret, response } = await createPaymentIntent(amountCents);
  console.log('[PaymentSheet] createPaymentIntent response:', response);

  if (typeof clientSecret !== 'string' || !clientSecret.trim()) {
    throw new Error('Payment could not start: the server did not return a valid session.');
  }

  const { error: initError } = await stripe.initPaymentSheet({
    merchantDisplayName: STRIPE_MERCHANT_DISPLAY_NAME,
    paymentIntentClientSecret: clientSecret.trim(),
    returnURL: STRIPE_PAYMENT_SHEET_RETURN_URL,
    allowsDelayedPaymentMethods: false,
  });

  if (initError) {
    console.error('[PaymentSheet] initPaymentSheet', initError);
    throw new Error(
      initError.message ||
        'Checkout is unavailable. Confirm EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY matches your backend mode (test vs live) and that the API URL is reachable.',
    );
  }

  const { error: presentError } = await stripe.presentPaymentSheet();
  if (presentError) {
    if (presentError.code === PaymentSheetError.Canceled) {
      return 'canceled';
    }
    console.error('[PaymentSheet] presentPaymentSheet', presentError);
    throw new Error(presentError.message || 'Payment did not complete.');
  }

  return 'success';
}
