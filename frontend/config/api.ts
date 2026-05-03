/**
 * Optional Stripe Connect Express URL (legacy HTTP). Disabled by default — Connect uses Firebase callables.
 */
const fromEnv = (process.env.EXPO_PUBLIC_STRIPE_API_URL?.trim() ?? '').replace(/\/$/, '');

if (!fromEnv) {
  console.warn('⚠️ EXPO_PUBLIC_STRIPE_API_URL is not set');
}

export const API_BASE_URL = fromEnv || '';

export const STRIPE_HTTP_ENABLED = false;

if (API_BASE_URL.includes('192.168') || API_BASE_URL.includes('localhost')) {
  throw new Error('❌ Local API URL is not allowed. Use Cloud Function URL.');
}
