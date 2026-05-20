import { getReadableErrorMessage } from './errorMessages';

export function stripeConnectErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: string }).code);
    if (code.includes('not-found')) {
      return 'Payout setup is not available yet. Please try again later.';
    }
    if (code.includes('unauthenticated')) {
      return 'Please sign in again.';
    }
    if (code.includes('failed-precondition')) {
      return 'Payout setup is not ready yet. Try again later.';
    }
    if (code.includes('permission-denied')) {
      return "You don't have permission to manage payouts for this account.";
    }
    if (code.includes('internal') || code.includes('unavailable')) {
      return 'Could not connect payouts. Check your connection and try again.';
    }
  }
  return getReadableErrorMessage(error, 'payment');
}
