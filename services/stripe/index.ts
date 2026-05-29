import { Platform } from 'react-native';
import type React from 'react';

export const isWeb = Platform.OS === 'web';
export const isNative = !isWeb;

const impl =
  Platform.OS === 'web'
    ? require('./stripe.web')
    : require('./stripe.native');

export const initializePaymentSheet = impl.initializePaymentSheet as (
  params: { amount: number; merchantDisplayName?: string; orderId?: string },
) => Promise<{ clientSecret: string; paymentIntentId: string }>;

export const openPaymentSheet = impl.openPaymentSheet as (
  params: { amount: number; merchantDisplayName?: string; orderId?: string },
) => Promise<
  | { status: 'success'; clientSecret: string; paymentIntentId: string; checkoutSessionId?: string }
  | { status: 'redirected'; clientSecret: string; paymentIntentId: string; checkoutSessionId?: string }
  | { status: 'canceled'; clientSecret: string; paymentIntentId: string; checkoutSessionId?: string }
  | { status: 'failed'; message: string; clientSecret: string; paymentIntentId: string; checkoutSessionId?: string }
>;

export const AppStripeProvider = impl.AppStripeProvider as React.ComponentType<{
  children: React.ReactNode;
  publishableKey?: string;
  merchantIdentifier?: string;
  urlScheme?: string;
}>;

export const useStripe = impl.useStripe as () => unknown;

