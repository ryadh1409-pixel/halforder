import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { createCheckoutSession } from './stripeConnect';

export async function payOrderWithStripe(params: {
  orderId: string;
  amount: number;
}): Promise<void> {
  void params.amount;
  const orderId = params.orderId.trim();
  if (!orderId) throw new Error('Missing order id');

  const successUrl = Linking.createURL('/order/payment-callback', {
    queryParams: { orderId, outcome: 'success' },
  });
  const cancelUrl = Linking.createURL('/order/payment-callback', {
    queryParams: { orderId, outcome: 'cancel' },
  });

  const { url } = await createCheckoutSession({ orderId, successUrl, cancelUrl });
  await WebBrowser.openBrowserAsync(url);
}
