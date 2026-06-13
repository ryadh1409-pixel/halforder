import { httpsCallable } from 'firebase/functions';
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

export type FoodSharePaymentSheetResult =
  | { status: 'success' }
  | { status: 'canceled' }
  | { status: 'redirected'; checkoutUrl: string }
  | { status: 'failed'; message: string };

export async function payFoodShareMatch(params: {
  matchId: string;
  merchantDisplayName?: string;
}): Promise<FoodSharePaymentSheetResult> {
  const matchId = params.matchId.trim();
  if (!matchId) throw new Error('Missing match id');

  assertNonAnonymousPaymentUser();
  await auth.currentUser?.getIdToken(true);

  const fn = httpsCallable(functions, 'createFoodSharePaymentIntent');
  const result = await fn({ matchId, platform: 'web' });
  const data = (result.data ?? {}) as { checkoutUrl?: string };
  const checkoutUrl =
    typeof data.checkoutUrl === 'string' ? data.checkoutUrl.trim() : '';
  if (!checkoutUrl) throw new Error('checkoutUrl missing');

  openWebCheckout(checkoutUrl);
  return { status: 'redirected', checkoutUrl };
}

export async function refundFoodShareMatchPayments(matchId: string): Promise<void> {
  const id = matchId.trim();
  if (!id) throw new Error('Missing match id');
  const fn = httpsCallable(functions, 'refundFoodShareMatch');
  await fn({ matchId: id });
}
