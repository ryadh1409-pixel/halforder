import React from 'react';

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
  | ({ status: 'failed'; message: string } & InitSheetResult);

const WEB_UNSUPPORTED_MESSAGE =
  'Card payment sheet is currently available on iOS/Android only.';

export async function initializePaymentSheet(
  _params: InitSheetParams,
): Promise<InitSheetResult> {
  throw new Error(WEB_UNSUPPORTED_MESSAGE);
}

export async function openPaymentSheet(
  _params: InitSheetParams,
): Promise<OpenPaymentSheetResult> {
  return {
    status: 'failed',
    message: WEB_UNSUPPORTED_MESSAGE,
    clientSecret: '',
    paymentIntentId: '',
  };
}

type WebProviderProps = {
  children: React.ReactNode;
  publishableKey?: string;
  merchantIdentifier?: string;
  urlScheme?: string;
};

export function AppStripeProvider({ children }: WebProviderProps) {
  return children as React.ReactElement;
}

export function useStripe() {
  return {
    isPlatformPaySupported: async () => false,
  };
}

