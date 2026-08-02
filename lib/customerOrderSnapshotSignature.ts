import { safeToMillis } from '@/utils/safeToMillis';

/** Fingerprint of live driver GPS for listener freshness / dedup. */
export function driverLocationFingerprint(raw: Record<string, unknown>): string {
  const loc = raw.driverLocation;
  if (!loc || typeof loc !== 'object') return '';
  const o = loc as Record<string, unknown>;
  const lat = o.lat ?? o.latitude ?? '';
  const lng = o.lng ?? o.longitude ?? '';
  const heading = typeof o.heading === 'number' && Number.isFinite(o.heading) ? o.heading : '';
  return `${lat},${lng},${heading}`;
}

/** Fingerprint for customer order listener dedup — includes live tracking fields. */
export function customerOrderSnapshotSignature(raw: Record<string, unknown>): string {
  return [
    raw.status,
    raw.deliveryStatus,
    raw.paymentStatus,
    safeToMillis(raw.updatedAt),
    safeToMillis(raw.pickedUpAt),
    safeToMillis(raw.deliveredAt),
    safeToMillis(raw.completedAt),
    raw.marketplaceArchived,
    raw.earningsRecorded,
    raw.driverId,
    raw.assignedDriverId,
    raw.estimatedDeliveryTime,
    driverLocationFingerprint(raw),
  ].join('|');
}
