import { getUserFriendlyError } from './errorHandler';

export function stripeConnectErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message && error.message.length < 220) {
    const m = error.message.trim();
    if (!/firebase|internal server/i.test(m)) return m;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: string }).code);
    if (code.includes('failed-precondition')) {
      return 'Stripe is not configured on the server yet. Try again later or contact support.';
    }
    if (code.includes('unauthenticated')) return 'Please sign in again.';
    if (code.includes('permission-denied')) {
      return 'You can only connect payouts for your own restaurant account.';
    }
    if (code.includes('internal') || code.includes('unavailable')) {
      return 'Could not reach Stripe. Check your connection and try again.';
    }
  }
  return getUserFriendlyError(error);
}
