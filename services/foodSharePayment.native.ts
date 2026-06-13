import {
  initPaymentSheet,
  presentPaymentSheet,
  type InitPaymentSheetResult,
  type PresentPaymentSheetResult,
} from '@stripe/stripe-react-native';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/services/firebase';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { logError } from '@/utils/errorLogger';

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

type FoodShareIntentResponse = {
  clientSecret?: string;
  customerId?: string;
  ephemeralKey?: string;
  amountCents?: number;
};

export async function payFoodShareMatch(params: {
  matchId: string;
  merchantDisplayName?: string;
}): Promise<FoodSharePaymentSheetResult> {
  const matchId = params.matchId.trim();
  if (!matchId) throw new Error('Missing match id');

  assertNonAnonymousPaymentUser();
  await auth.currentUser?.getIdToken(true);

  const fn = httpsCallable(functions, 'createFoodSharePaymentIntent');
  const result = await fn({ matchId, platform: 'native' });
  const data = (result.data ?? {}) as FoodShareIntentResponse;

  const clientSecret =
    typeof data.clientSecret === 'string' ? data.clientSecret.trim() : '';
  const customerId =
    typeof data.customerId === 'string' ? data.customerId.trim() : '';
  const ephemeralKey =
    typeof data.ephemeralKey === 'string' ? data.ephemeralKey.trim() : '';
  if (!clientSecret) throw new Error('clientSecret missing');

  const initResult: InitPaymentSheetResult = await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    ...(customerId && ephemeralKey
      ? { customerId, customerEphemeralKeySecret: ephemeralKey }
      : {}),
    merchantDisplayName: params.merchantDisplayName ?? 'HalfOrder',
    returnURL: 'halforder://stripe-redirect',
  });
  if (initResult.error) {
    logError(initResult.error);
    throw new Error(getUserFriendlyError(initResult.error, { context: 'payment' }));
  }

  const presentResult: PresentPaymentSheetResult = await presentPaymentSheet();
  if (presentResult.error) {
    if (presentResult.error.code === 'Canceled') {
      return { status: 'canceled' };
    }
    return {
      status: 'failed',
      message: getUserFriendlyError(presentResult.error, { context: 'payment' }),
    };
  }

  return { status: 'success' };
}

export async function refundFoodShareMatchPayments(matchId: string): Promise<void> {
  const id = matchId.trim();
  if (!id) throw new Error('Missing match id');
  const fn = httpsCallable(functions, 'refundFoodShareMatch');
  await fn({ matchId: id });
}
