import { loadStripe } from '@stripe/stripe-js';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export async function openWebCheckout(sessionId: string): Promise<void> {
  const trimmed = sessionId.trim();
  if (!trimmed) {
    throw new Error('Missing checkoutSessionId');
  }

  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error('Stripe failed to initialize');
  }

  const { error } = await stripe.redirectToCheckout({
    sessionId: trimmed,
  });

  if (error) {
    throw error;
  }
}
