type ConfirmPaymentResult = {
  paymentIntent?: { id?: string; status?: string };
  error?: { message?: string };
};

export function useStripeWrapper() {
  return {
    confirmPayment: async (): Promise<ConfirmPaymentResult> => ({
      paymentIntent: {
        id: `mock_pi_${Date.now()}`,
        status: 'Succeeded (Mock)',
      },
    }),
  };
}
