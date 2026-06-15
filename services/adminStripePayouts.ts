import type {
  AdminStripePayoutRow,
  AdminStripePayoutsPayload,
} from '@/types/adminStripePayouts';
import { functions } from '@/services/firebase';
import { httpsCallable } from 'firebase/functions';

export type { AdminStripePayoutRow, AdminStripePayoutsPayload };

export async function fetchAdminStripePayouts(): Promise<AdminStripePayoutsPayload> {
  const fn = httpsCallable<Record<string, never>, AdminStripePayoutsPayload>(
    functions,
    'getAdminStripePayouts',
  );
  const result = await fn({});
  return result.data;
}

export function formatPayoutMoney(
  amount: number | null | undefined,
  currency = 'cad',
): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function formatPayoutDate(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatPayoutDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
