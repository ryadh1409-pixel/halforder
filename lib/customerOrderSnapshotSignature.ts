import { safeToMillis } from '@/utils/safeToMillis';

/** Fingerprint for customer order listener dedup — includes live tracking fields. */
export function customerOrderSnapshotSignature(raw: Record<string, unknown>): string {
  const driverLoc =
    raw.driverLocation && typeof raw.driverLocation === 'object'
      ? `${(raw.driverLocation as { lat?: unknown }).lat ?? ''},${(raw.driverLocation as { lng?: unknown }).lng ?? ''}`
      : '';
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
    driverLoc,
  ].join('|');
}
