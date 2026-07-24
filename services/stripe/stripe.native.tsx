import {
  initPaymentSheet,
  presentPaymentSheet,
  StripeProvider,
  useStripe,
  type InitPaymentSheetResult,
  type PresentPaymentSheetResult,
} from '@stripe/stripe-react-native';
import { isNativePaymentsAndMapsSupported } from '@/constants/runtimeEnvironment';
import { httpsCallable } from 'firebase/functions';
import React from 'react';
import { Platform } from 'react-native';
import { auth, functions } from '@/services/firebase';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { logError } from '@/utils/errorLogger';

const SIGN_IN_REQUIRED_ERROR = 'Please sign in to complete payment';

/** Prevents duplicate PaymentIntent creation / double PaymentSheet present. */
let paymentSheetInFlight = false;

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
  | ({ status: 'failed'; message: string } & InitSheetResult)
  | ({
      status: 'redirected';
      checkoutSessionId?: string;
      checkoutUrl?: string;
    } & InitSheetResult);

function parsePaymentIntentId(clientSecret: string): string {
  const idx = clientSecret.indexOf('_secret_');
  return idx > 0 ? clientSecret.slice(0, idx) : clientSecret;
}

function amountDollarsLabel(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

const PAYMENT_SHEET_APPEARANCE = {
  colors: {
    primary: '#A855F7',
    background: '#171923',
    componentBackground: '#1C1F2E',
    // Stripe PaymentSheet requires #RRGGBB or #AARRGGBB (no CSS rgba()).
    componentBorder: '#47A855F7',
    componentDivider: '#29A855F7',
    primaryText: '#FFFFFF',
    secondaryText: '#B7BDC9',
    componentText: '#FFFFFF',
    placeholderText: '#7D8493',
    icon: '#FFFFFF',
    error: '#EF4444',
  },
  shapes: {
    borderRadius: 12,
    borderWidth: 1,
  },
} as const;

export type PresentConfiguredPaymentSheetParams = {
  clientSecret: string;
  customerId?: string;
  ephemeralKey?: string;
  merchantDisplayName?: string;
  /** Amount in cents for Apple Pay line item (optional). */
  amountCents?: number;
};

/**
 * Single reusable PaymentSheet presenter for the app.
 * Call after your flow already has a PaymentIntent client secret.
 * Does not create intents or write Firestore.
 */
export async function presentConfiguredPaymentSheet(
  params: PresentConfiguredPaymentSheetParams,
): Promise<
  | { status: 'success' }
  | { status: 'canceled' }
  | { status: 'failed'; message: string }
> {
  const clientSecret = params.clientSecret.trim();
  if (!clientSecret) {
    return { status: 'failed', message: 'clientSecret missing' };
  }

  const merchantDisplayName = params.merchantDisplayName ?? 'HalfOrder';
  const amountCents =
    typeof params.amountCents === 'number' && Number.isFinite(params.amountCents)
      ? Math.max(0, params.amountCents)
      : 0;
  const customerId = params.customerId?.trim() ?? '';
  const ephemeralKey = params.ephemeralKey?.trim() ?? '';

  const initResult: InitPaymentSheetResult = await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    ...(customerId && ephemeralKey
      ? { customerId, customerEphemeralKeySecret: ephemeralKey }
      : {}),
    merchantDisplayName,
    returnURL: 'halforder://stripe-redirect',
    allowsDelayedPaymentMethods: false,
    applePay: {
      merchantCountryCode: 'CA',
      cartItems: [
        {
          paymentType: 'Immediate',
          label: merchantDisplayName,
          amount: amountDollarsLabel(amountCents),
        },
      ],
    },
    appearance: PAYMENT_SHEET_APPEARANCE,
  });
  if (initResult.error) {
    logError(initResult.error);
    return {
      status: 'failed',
      message: getUserFriendlyError(initResult.error, { context: 'payment' }),
    };
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

async function createPaymentIntentSecrets(
  params: InitSheetParams,
): Promise<InitSheetResult & { customerId: string; ephemeralKey: string }> {
  const amount = Number(params.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer (in cents).');
  }

  assertNonAnonymousPaymentUser();
  await auth.currentUser?.getIdToken(true);

  const fn = httpsCallable(functions, 'createPaymentIntent');
  const result = await fn({
    amount,
    orderId: params.orderId ?? null,
    platform: 'native',
  });
  const data = result.data as Record<string, unknown> | undefined;
  const clientSecret =
    typeof data?.clientSecret === 'string'
      ? data.clientSecret
      : typeof data?.client_secret === 'string'
        ? data.client_secret
        : undefined;

  if (!clientSecret) throw new Error('clientSecret missing');

  const customerId =
    typeof data?.customerId === 'string' ? data.customerId.trim() : '';
  const ephemeralKey =
    typeof data?.ephemeralKey === 'string' ? data.ephemeralKey.trim() : '';
  const paymentIntentId =
    typeof data?.paymentIntentId === 'string' && data.paymentIntentId.trim()
      ? data.paymentIntentId.trim()
      : parsePaymentIntentId(clientSecret);

  return { clientSecret, paymentIntentId, customerId, ephemeralKey };
}

/** Creates a PaymentIntent and initializes PaymentSheet (does not present). */
export async function initializePaymentSheet(
  params: InitSheetParams,
): Promise<InitSheetResult> {
  const merchantDisplayName = params.merchantDisplayName ?? 'HalfOrder';
  const secrets = await createPaymentIntentSecrets(params);

  const initResult: InitPaymentSheetResult = await initPaymentSheet({
    paymentIntentClientSecret: secrets.clientSecret,
    ...(secrets.customerId && secrets.ephemeralKey
      ? {
          customerId: secrets.customerId,
          customerEphemeralKeySecret: secrets.ephemeralKey,
        }
      : {}),
    merchantDisplayName,
    returnURL: 'halforder://stripe-redirect',
    allowsDelayedPaymentMethods: false,
    applePay: {
      merchantCountryCode: 'CA',
      cartItems: [
        {
          paymentType: 'Immediate',
          label: merchantDisplayName,
          amount: amountDollarsLabel(params.amount),
        },
      ],
    },
    appearance: PAYMENT_SHEET_APPEARANCE,
  });
  if (initResult.error) {
    logError(initResult.error);
    throw new Error(getUserFriendlyError(initResult.error, { context: 'payment' }));
  }

  if (params.orderId && __DEV__) {
    console.log(
      JSON.stringify({
        msg: 'payment_flow_sheet_initialized',
        orderId: params.orderId,
        paymentIntentId: secrets.paymentIntentId,
        platform: Platform.OS,
      }),
    );
  }

  return {
    clientSecret: secrets.clientSecret,
    paymentIntentId: secrets.paymentIntentId,
  };
}

/** Creates a PaymentIntent and immediately presents Stripe PaymentSheet. */
export async function openPaymentSheet(
  params: InitSheetParams,
): Promise<OpenPaymentSheetResult> {
  if (paymentSheetInFlight) {
    return {
      status: 'failed',
      message: 'Payment is already in progress.',
      clientSecret: '',
      paymentIntentId: '',
    };
  }

  paymentSheetInFlight = true;
  try {
    const merchantDisplayName = params.merchantDisplayName ?? 'HalfOrder';
    const secrets = await createPaymentIntentSecrets(params);
    const init = {
      clientSecret: secrets.clientSecret,
      paymentIntentId: secrets.paymentIntentId,
    };

    const sheet = await presentConfiguredPaymentSheet({
      clientSecret: secrets.clientSecret,
      customerId: secrets.customerId,
      ephemeralKey: secrets.ephemeralKey,
      merchantDisplayName,
      amountCents: params.amount,
    });

    if (sheet.status === 'canceled') {
      return { status: 'canceled', ...init };
    }
    if (sheet.status === 'failed') {
      return { status: 'failed', message: sheet.message, ...init };
    }
    return { status: 'success', ...init };
  } finally {
    paymentSheetInFlight = false;
  }
}

type StripeProviderProps = React.ComponentProps<typeof StripeProvider>;

export function AppStripeProvider(props: StripeProviderProps) {
  /** Expo Go: no embedded Stripe native SDK — avoid mounting `StripeProvider`. */
  if (!isNativePaymentsAndMapsSupported) {
    return <>{props.children}</>;
  }
  return <StripeProvider {...props} />;
}

export { useStripe };
