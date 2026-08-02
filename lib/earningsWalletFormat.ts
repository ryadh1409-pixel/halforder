/** Display helpers for Earnings Wallet UI — local timezone from Firestore timestamps. */

import { safeTimestampToDate } from '@/utils/time';

export function formatWalletMoney(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function formatWalletLocalDate(value: unknown): string {
  const date = safeTimestampToDate(value);
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

export function formatWalletLocalTime(value: unknown): string {
  const date = safeTimestampToDate(value);
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}
