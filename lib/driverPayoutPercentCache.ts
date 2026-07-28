import {
  DEFAULT_DRIVER_PAYOUT_PERCENT,
  clampDriverPayoutPercent,
} from '@/lib/driverEarnings';

/** Process-local cache updated by `services/driverPayoutSettings` (no Firestore here). */
let cachedDriverPayoutPercent = DEFAULT_DRIVER_PAYOUT_PERCENT;

export function getCachedDriverPayoutPercent(): number {
  return cachedDriverPayoutPercent;
}

export function setCachedDriverPayoutPercent(raw: unknown): number {
  cachedDriverPayoutPercent = clampDriverPayoutPercent(
    raw,
    DEFAULT_DRIVER_PAYOUT_PERCENT,
  );
  return cachedDriverPayoutPercent;
}
