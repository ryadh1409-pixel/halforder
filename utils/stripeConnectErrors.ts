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
    if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
      return 'Network error. Check your connection and try again.';
    }
    if (code.includes('internal')) {
      return 'Server error while opening payout setup. Please try again.';
    }
  }
  const msg = getReadableErrorMessage(error, 'payment');
  // Avoid the old generic Connect failure copy for non-network cases.
  if (/could not connect payouts/i.test(msg)) {
    return 'Unable to open bank account setup. Please try again.';
  }
  return msg;
}
