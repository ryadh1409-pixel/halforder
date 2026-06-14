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
import { openWebCheckout } from '@/services/stripeWebCheckout';

const SIGN_IN_REQUIRED_ERROR = 'Please sign in to complete payment';

function assertNonAnonymousPaymentUser(): void {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    if (currentUser?.isAnonymous) void auth.signOut();
    throw new Error(SIGN_IN_REQUIRED_ERROR);
  }
}

export type FoodSharePaymentSheetResult =
  | { status: 'success'; paymentIntentId?: string }
  | { status: 'canceled' }
  | { status: 'redirected'; checkoutUrl: string }
  | { status: 'failed'; message: string };

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

  let data: { checkoutUrl?: string; checkoutSessionId?: string };
  try {
    data = (await invokeFoodSharePaymentIntent({
      matchId,
      platform: 'web',
    })) as { checkoutUrl?: string; checkoutSessionId?: string };
  } catch (error) {
    const parsed = parseCallableError(error);
    console.error('[STRIPE ERROR]', parsed.code, parsed.message, parsed.details);
    throw error;
  }

  console.log('[STRIPE STEP] payment_intent_response', data);

  const checkoutUrl =
    typeof data.checkoutUrl === 'string' ? data.checkoutUrl.trim() : '';
  if (!checkoutUrl) {
    console.error('[STRIPE ERROR]', 'checkoutUrl missing from response', data);
    throw new Error('checkoutUrl missing');
  }

  console.log('[PAYMENT SHEET OPENED]', { matchId, checkoutUrl });
  openWebCheckout(checkoutUrl);
  return { status: 'redirected', checkoutUrl };
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
