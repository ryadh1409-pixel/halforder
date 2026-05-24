/**
 * Canonical restaurant venue open/closed parsing — single source for Firestore → UI.
 */
export type VenueAvailability = 'open' | 'closed';

const LOG_PREFIX = '[venue-status]';

/** Normalize a raw `isOpen` field value to boolean (field-level only). */
export function coerceRestaurantIsOpenValue(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'false' || normalized === 'closed' || normalized === '0') {
      return false;
    }
    if (normalized === 'true' || normalized === 'open' || normalized === '1') {
      return true;
    }
  }
  if (typeof raw === 'number') {
    return raw !== 0;
  }
  return true;
}

/** True when raw Firestore `isOpen` matches expected after normalization. */
export function isRestaurantIsOpenMatching(raw: unknown, expected: boolean): boolean {
  return coerceRestaurantIsOpenValue(raw) === expected;
}

/** Parse canonical `restaurants/{id}.isOpen` from a document snapshot. */
export function parseRestaurantIsOpen(
  data: Record<string, unknown> | undefined | null,
): boolean {
  if (!data) return true;
  return coerceRestaurantIsOpenValue(data.isOpen);
}

export function venueAvailabilityFromIsOpen(isOpen: boolean): VenueAvailability {
  return isOpen ? 'open' : 'closed';
}

export function venueAvailabilityLabel(isOpen: boolean): string {
  return isOpen ? 'OPEN' : 'CLOSED';
}

/** Dev-only logs for write failures and critical persistence mismatches. */
export function logVenueStatusError(
  stage: 'write-failure' | 'snapshot-error' | 'persist-mismatch',
  payload: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  console.warn(LOG_PREFIX, stage, payload);
}
