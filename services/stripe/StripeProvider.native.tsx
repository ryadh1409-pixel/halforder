import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

type Props = {
  children: React.ReactNode;
};

/** Must match `@stripe/stripe-react-native` plugin `merchantIdentifier` in app.json. */
const APPLE_MERCHANT_ID = 'merchant.com.halforfer';

export default function StripeProviderWrapper({ children }: Props) {
  /** Test/live publishable key only — set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (e.g. pk_test_…) in `.env`. */
  const publishableKey =
    process.env.EXPO_PUBLIC_STRIPE_KEY?.trim() ||
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    '';

  console.log(
    '[StripeProvider] publishableKey:',
    publishableKey ? `${publishableKey.slice(0, 12)}… (${publishableKey.length} chars)` : '(MISSING — PaymentSheet will fail)',
  );

  if (__DEV__ && !publishableKey) {
    console.warn(
      '[Stripe] Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (or EXPO_PUBLIC_STRIPE_KEY). PaymentSheet will not work without it.',
    );
  }

  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={APPLE_MERCHANT_ID}
      urlScheme="halforder"
    >
      {children}
    </StripeProvider>
  );
}
