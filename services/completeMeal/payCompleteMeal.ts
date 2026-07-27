import { auth } from '@/services/firebase';
import {
  confirmCompleteMealPayment,
  createCompleteMealPaymentIntent,
} from '@/services/completeMeal/callables';
import { presentConfiguredPaymentSheet } from '@/services/stripe';

export type CompleteMealPayResult =
  | { status: 'success'; paymentIntentId: string; funded: boolean; orderId: string | null }
  | { status: 'canceled' }
  | { status: 'failed'; message: string };

function parsePaymentIntentId(
  clientSecret: string,
  paymentIntentId?: string,
): string {
  if (paymentIntentId?.trim()) return paymentIntentId.trim();
  const idx = clientSecret.indexOf('_secret_');
  return idx > 0 ? clientSecret.slice(0, idx) : clientSecret;
}

export async function payCompleteMealContribution(params: {
  campaignId: string;
  amountCents: number;
  merchantDisplayName?: string;
}): Promise<CompleteMealPayResult> {
  const campaignId = params.campaignId.trim();
  if (!campaignId) return { status: 'failed', message: 'Missing campaign.' };

  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    return { status: 'failed', message: 'Please sign in to contribute.' };
  }
  await user.getIdToken(true);

  let intent;
  try {
    intent = await createCompleteMealPaymentIntent({
      campaignId,
      amountCents: params.amountCents,
    });
  } catch (e) {
    return {
      status: 'failed',
      message: e instanceof Error ? e.message : 'Could not start payment.',
    };
  }

  const clientSecret = intent.clientSecret?.trim() ?? '';
  if (!clientSecret) {
    return { status: 'failed', message: 'Payment sheet unavailable.' };
  }

  const sheet = await presentConfiguredPaymentSheet({
    clientSecret,
    customerId: intent.customerId,
    ephemeralKey: intent.ephemeralKey ?? undefined,
    merchantDisplayName: params.merchantDisplayName ?? 'HalfOrder',
    amountCents: intent.amountCents,
  });

  if (sheet.status === 'canceled') return { status: 'canceled' };
  if (sheet.status === 'failed') {
    return { status: 'failed', message: sheet.message };
  }

  const paymentIntentId = parsePaymentIntentId(
    clientSecret,
    intent.paymentIntentId,
  );

  try {
    const confirmed = await confirmCompleteMealPayment({
      campaignId,
      paymentIntentId,
    });
    return {
      status: 'success',
      paymentIntentId,
      funded: confirmed.funded,
      orderId: confirmed.orderId,
    };
  } catch (e) {
    return {
      status: 'failed',
      message:
        e instanceof Error
          ? e.message
          : 'Payment succeeded but confirmation failed. Refresh shortly.',
    };
  }
}
