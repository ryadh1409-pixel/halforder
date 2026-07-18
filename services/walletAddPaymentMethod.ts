import { createWalletSetupIntent } from '@/services/walletPaymentMethods';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { logError } from '@/utils/errorLogger';
import { Platform } from 'react-native';

export type WalletAddCardResult =
  | { status: 'success' }
  | { status: 'canceled' }
  | { status: 'failed'; message: string }
  | { status: 'unsupported'; message: string };

/**
 * Opens Stripe PaymentSheet in setup mode to save a card on the Customer.
 * Native only — web returns unsupported.
 */
export async function presentWalletAddPaymentMethod(): Promise<WalletAddCardResult> {
  if (Platform.OS === 'web') {
    return {
      status: 'unsupported',
      message: 'Add card is available in the HalfOrder iOS / Android app.',
    };
  }

  try {
    const { clientSecret } = await createWalletSetupIntent();
    const {
      initPaymentSheet,
      presentPaymentSheet,
    } = await import('@stripe/stripe-react-native');

    const init = await initPaymentSheet({
      setupIntentClientSecret: clientSecret,
      merchantDisplayName: 'HalfOrder',
      returnURL: 'halforder://stripe-redirect',
      applePay: {
        merchantCountryCode: 'CA',
      },
    });
    if (init.error) {
      logError(init.error);
      return {
        status: 'failed',
        message: getUserFriendlyError(init.error, { context: 'payment' }),
      };
    }

    const present = await presentPaymentSheet();
    if (present.error) {
      if (present.error.code === 'Canceled') {
        return { status: 'canceled' };
      }
      return {
        status: 'failed',
        message: getUserFriendlyError(present.error, { context: 'payment' }),
      };
    }
    return { status: 'success' };
  } catch (e) {
    logError(e);
    return {
      status: 'failed',
      message: getUserFriendlyError(e, { context: 'payment' }),
    };
  }
}
