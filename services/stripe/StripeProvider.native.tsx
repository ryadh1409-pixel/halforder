import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

type Props = {
  children: React.ReactNode;
};

export default function StripeProviderWrapper({ children }: Props) {
  const publishableKey =
    process.env.EXPO_PUBLIC_STRIPE_KEY ??
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    '';
  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier="merchant.com.halforder.app"
    >
      {children}
    </StripeProvider>
  );
}
