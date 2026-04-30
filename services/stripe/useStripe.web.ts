type ConfirmPaymentResult = {
  paymentIntent?: { id?: string; status?: string };
  error?: { message?: string };
};

export function useStripeWrapper() {
  return {
    initPaymentSheet: async (): Promise<{ error?: { message?: string } }> => ({}),
    presentPaymentSheet: async (): Promise<{ error?: { message?: string } }> => ({}),
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
