const platformPay = {
  PaymentType: { Immediate: 'Immediate' },
  ButtonType: { Buy: 'Buy' },
  ButtonStyle: { Black: 'Black' },
  isPlatformPaySupported: async () => false,
  confirmPlatformPayPayment: async () => ({
    error: { message: 'Platform Pay is only available on mobile.' },
  }),
};

export default platformPay;
