import { formatFirestoreTime } from '@/lib/admin/orderHelpers';
import { safeToMillis } from '@/utils/safeToMillis';

/**
 * Format a Firestore server timestamp field for receipt display.
 * Never falls back to the device clock — returns "—" when missing.
 */
export function formatPaidAtLabel(raw: unknown): string {
  const ms = safeToMillis(raw);
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  return formatFirestoreTime(ms);
}

export function paidAtMillis(raw: unknown): number | null {
  const ms = safeToMillis(raw);
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}
