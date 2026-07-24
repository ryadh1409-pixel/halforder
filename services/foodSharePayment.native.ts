import { auth } from '@/services/firebase';
import {
  invokeFoodSharePaymentConfirm,
  invokeFoodSharePaymentIntent,
} from '@/services/foodSharePaymentCallable';
import {
  assertPaymentDocsReady,
  parseCallableError,
  readPaymentDocsForMatch,
} from '@/services/foodSharePaymentDocReads';
import { presentConfiguredPaymentSheet } from '@/services/stripe';

const SIGN_IN_REQUIRED_ERROR = 'Please sign in to complete payment';

function assertNonAnonymousPaymentUser(): void {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    if (currentUser?.isAnonymous) void auth.signOut();
    throw new Error(SIGN_IN_REQUIRED_ERROR);
  }
}

export type FoodSharePaymentSheetResult =
  | { status: 'success'; paymentIntentId: string }
  | { status: 'canceled' }
  | { status: 'redirected'; checkoutUrl: string }
  | { status: 'failed'; message: string };

type FoodShareIntentResponse = {
  clientSecret?: string;
  customerId?: string;
  ephemeralKey?: string;
  paymentIntentId?: string;
  amountCents?: number;
};

function parsePaymentIntentId(
  clientSecret: string,
  paymentIntentId?: string,
): string {
  if (paymentIntentId?.trim()) return paymentIntentId.trim();
  const idx = clientSecret.indexOf('_secret_');
  return idx > 0 ? clientSecret.slice(0, idx) : clientSecret;
}

export async function payFoodShareMatch(params: {
  matchId: string;
  merchantDisplayName?: string;
}): Promise<FoodSharePaymentSheetResult> {
  const matchId = params.matchId.trim();
  if (!matchId) throw new Error('Missing match id');

  console.log('[STRIPE STEP] pay_button_pressed', { matchId });
  assertNonAnonymousPaymentUser();
  await auth.currentUser?.getIdToken(true);

  console.log('[STRIPE STEP] loading_match', matchId);
  const preflight = await readPaymentDocsForMatch(matchId);
  try {
    assertPaymentDocsReady(preflight);
  } catch (error) {
    console.error('[PAYMENT MISSING DOC]', preflight.matchPath, {
      preflight,
      error,
    });
    throw error;
  }

  console.log('[STRIPE STEP] creating_payment_intent');

  let data: FoodShareIntentResponse;
  try {
    data = (await invokeFoodSharePaymentIntent({
      matchId,
      platform: 'native',
    })) as FoodShareIntentResponse;
  } catch (error) {
    const parsed = parseCallableError(error);
    console.error('[STRIPE ERROR]', {
      step: 'invokeFoodSharePaymentIntent',
      code: parsed.code,
      message: parsed.message,
      details: parsed.details,
      matchId,
      matchPath: preflight.matchPath,
      matchExistsClient: preflight.matchExists,
    });
    throw error;
  }

  console.log('[STRIPE STEP] payment_intent_response', data);

  const clientSecret =
    typeof data.clientSecret === 'string' ? data.clientSecret.trim() : '';
  const customerId =
    typeof data.customerId === 'string' ? data.customerId.trim() : '';
  const ephemeralKey =
    typeof data.ephemeralKey === 'string' ? data.ephemeralKey.trim() : '';
  if (!clientSecret) {
    console.error('[STRIPE ERROR]', 'clientSecret missing from response', data);
    throw new Error('clientSecret missing');
  }
  console.log('[STRIPE STEP] client_secret_received');

  const paymentIntentId = parsePaymentIntentId(
    clientSecret,
    data.paymentIntentId,
  );

  const amountCents =
    typeof data.amountCents === 'number' && Number.isFinite(data.amountCents)
      ? Math.max(0, data.amountCents)
      : 0;

  console.log('[STRIPE STEP] init_payment_sheet');
  console.log('[PAYMENT SHEET OPENED]', { matchId, paymentIntentId });
  const sheet = await presentConfiguredPaymentSheet({
    clientSecret,
    customerId,
    ephemeralKey,
    merchantDisplayName: params.merchantDisplayName ?? 'HalfOrder',
    amountCents,
  });

  if (sheet.status === 'canceled') {
    return { status: 'canceled' };
  }
  if (sheet.status === 'failed') {
    console.error('[STRIPE ERROR]', sheet.message);
    return { status: 'failed', message: sheet.message };
  }

  console.log('[STRIPE STEP] payment_success', { matchId, paymentIntentId });
  console.log('[PAYMENT COMPLETED]', { matchId, paymentIntentId });

  try {
    await invokeFoodSharePaymentConfirm({ matchId, paymentIntentId });
  } catch (error) {
    console.error('[STRIPE ERROR]', 'confirmFoodSharePayment failed', error);
  }

  return { status: 'success', paymentIntentId };
}

export async function confirmFoodSharePaymentAfterRedirect(params: {
  matchId: string;
  paymentIntentId?: string;
}): Promise<void> {
  await invokeFoodSharePaymentConfirm({
    matchId: params.matchId,
    ...(params.paymentIntentId ? { paymentIntentId: params.paymentIntentId } : {}),
  });
}

export async function refundFoodShareMatchPayments(matchId: string): Promise<void> {
  const id = matchId.trim();
  if (!id) throw new Error('Missing match id');
  const { httpsCallable } = await import('firebase/functions');
  const { functions } = await import('@/services/firebase');
  const fn = httpsCallable(functions, 'refundFoodShareMatch');
  await fn({ matchId: id });
}
