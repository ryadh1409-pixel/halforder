import { createCheckoutSession } from './api';
import * as WebBrowser from 'expo-web-browser';

export async function payOrderWithStripe(params: {
  orderId: string;
  amount: number;
}): Promise<void> {
  const session = await createCheckoutSession({
    orderId: params.orderId,
    amount: params.amount,
  });
  await WebBrowser.openBrowserAsync(session.url);
}
