import type {
  StripeAccountDiagnosticsPayload,
  StripeTreasurySummaryPayload,
} from '@/types/adminStripeTreasury';
import { functions } from '@/services/firebase';
import { httpsCallable } from 'firebase/functions';

export type { StripeAccountDiagnosticsPayload, StripeTreasurySummaryPayload };

export async function fetchStripeTreasurySummary(): Promise<StripeTreasurySummaryPayload> {
  const fn = httpsCallable<Record<string, never>, StripeTreasurySummaryPayload>(
    functions,
    'getStripeTreasurySummary',
  );
  const result = await fn({});
  return result.data;
}

export async function fetchStripeAccountDiagnostics(): Promise<StripeAccountDiagnosticsPayload> {
  const fn = httpsCallable<Record<string, never>, StripeAccountDiagnosticsPayload>(
    functions,
    'getStripeAccountDiagnostics',
  );
  const result = await fn({});
  return result.data;
}

export function formatTreasuryMoney(
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
