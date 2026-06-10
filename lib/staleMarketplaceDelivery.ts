/** Shared staleness rules for assigned-but-never-completed marketplace deliveries. */

export const DEFAULT_STALE_ASSIGNED_MS = 48 * 60 * 60 * 1000;

const STALE_KITCHEN_STATUSES = new Set([
  'payment_confirmed',
  'pending_driver',
  'driver_assigned',
  'pending',
]);

const STALE_COURIER_STATUSES = new Set(['driver_assigned', 'pending']);

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasAssignedDriver(data: Record<string, unknown>): boolean {
  return norm(data.driverId).length > 0 || norm(data.assignedDriverId).length > 0;
}

function isTerminalAssignedOrder(data: Record<string, unknown>): boolean {
  if (data.earningsRecorded === true) return true;
  if (data.marketplaceArchived === true) {
    const courier = norm(data.deliveryStatus);
    if (courier === 'delivered' || courier === 'completed') return true;
  }
  const kitchen = norm(data.status);
  const courier = norm(data.deliveryStatus);
  if (kitchen === 'completed' || kitchen === 'delivered' || kitchen === 'cancelled') {
    return true;
  }
  if (courier === 'delivered' || courier === 'completed' || courier === 'cancelled') {
    return true;
  }
  return false;
}

export function isStaleAssignedMarketplaceDelivery(
  data: Record<string, unknown>,
  lastActivityMs: number | null,
  options?: { nowMs?: number; staleMs?: number },
): boolean {
  const nowMs = options?.nowMs ?? Date.now();
  const staleMs = options?.staleMs ?? DEFAULT_STALE_ASSIGNED_MS;

  if (!hasAssignedDriver(data)) return false;
  if (isTerminalAssignedOrder(data)) return false;
  if (data.expired === true) return false;

  const kitchen = norm(data.status);
  const courier = norm(data.deliveryStatus);
  if (!STALE_KITCHEN_STATUSES.has(kitchen)) return false;
  if (!STALE_COURIER_STATUSES.has(courier)) return false;
  if (lastActivityMs == null || !Number.isFinite(lastActivityMs)) return false;

  return nowMs - lastActivityMs >= staleMs;
}
