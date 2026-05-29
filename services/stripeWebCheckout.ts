/**
 * Web Stripe Checkout — navigate to hosted session URL (Stripe.js redirectToCheckout is deprecated).
 */
export function openWebCheckout(checkoutUrl: string): void {
  const url = checkoutUrl.trim();
  if (!url) {
    throw new Error('Missing checkoutUrl');
  }
  if (typeof window === 'undefined') {
    throw new Error('Web checkout requires a browser environment');
  }
  window.location.assign(url);
}
