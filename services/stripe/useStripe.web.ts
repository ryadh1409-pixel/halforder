type ConfirmPaymentResult = {
  paymentIntent?: { id?: string; status?: string };
  error?: { message?: string };
};

const webOnlyError = {
  message: 'In-app card payment runs on iOS and Android. Use the native build for PaymentSheet.',
  code: 'Failed',
} as const;

export function useStripeWrapper() {
  return {
    initPaymentSheet: async (): Promise<{ error?: { message?: string; code?: string } }> => ({
      error: webOnlyError,
    }),
    presentPaymentSheet: async (): Promise<{ error?: { message?: string; code?: string } }> => ({
      error: webOnlyError,
    }),
    confirmPayment: async (
      _clientSecret?: string,
      _params?: unknown,
    ): Promise<ConfirmPaymentResult> => ({
      paymentIntent: {
        id: `mock_pi_${Date.now()}`,
        status: 'Succeeded (Mock)',
      },
    }),
  };
}
