/** Log every order doc seen from a Firestore listener/query (debug stale reintroduction). */
export function logQuerySource(
  orderId: string,
  status: unknown,
  deliveryStatus: unknown,
  snapshotQueryName: string,
  meta?: {
    firestorePath?: string;
    driverId?: unknown;
    assignedDriverId?: unknown;
    fromCache?: boolean;
    entersActiveList?: boolean;
    duplicateQueryMatch?: boolean;
  },
): void {
  console.log('[QUERY SOURCE]', orderId, status ?? null, deliveryStatus ?? null, snapshotQueryName);
  if (!meta) return;
  console.log('[QUERY SOURCE META]', {
    orderId,
    snapshotQueryName,
    firestorePath: meta.firestorePath ?? `orders/${orderId}`,
    driverId: meta.driverId ?? null,
    assignedDriverId: meta.assignedDriverId ?? null,
    fromCache: meta.fromCache ?? null,
    entersActiveList: meta.entersActiveList ?? false,
    duplicateQueryMatch: meta.duplicateQueryMatch ?? false,
  });
}

/** Log raw Firestore fields before an order enters (or is rejected from) driver active lists. */
export function logDriverActiveFilter(
  orderId: string,
  raw: { deliveryStatus?: unknown; status?: unknown },
  kept: boolean,
  reason: string | undefined,
  snapshotQueryName: string,
): void {
  logQuerySource(orderId, raw.status, raw.deliveryStatus, snapshotQueryName, {
    firestorePath: `orders/${orderId}`,
    entersActiveList: kept,
  });
  console.log('[ACTIVE FILTER]', {
    orderId,
    deliveryStatus: raw.deliveryStatus ?? null,
    status: raw.status ?? null,
    kept,
    reason: reason ?? null,
    snapshotQueryName,
    firestorePath: `orders/${orderId}`,
  });
}

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Raw Firestore terminal signals — filter before lifecycle mapping. */
export function isRawDriverActiveTerminal(raw: {
  deliveryStatus?: unknown;
  status?: unknown;
  deliveredAt?: unknown;
  completedAt?: unknown;
}): boolean {
  const kitchen = norm(raw.status);
  const courier = norm(raw.deliveryStatus);
  if (kitchen === 'completed' || kitchen === 'delivered') return true;
  if (courier === 'delivered' || courier === 'completed') return true;
  return false;
}

/** Warn when the same order id is returned by more than one driver query. */
export function logDuplicateQueryDocMatch(
  orderId: string,
  sources: string[],
  raw: { status?: unknown; deliveryStatus?: unknown },
): void {
  if (sources.length < 2) return;
  console.warn('[QUERY SOURCE DUPLICATE DOC]', {
    orderId,
    sources,
    status: raw.status ?? null,
    deliveryStatus: raw.deliveryStatus ?? null,
    firestorePath: `orders/${orderId}`,
    note: 'single Firestore doc matched multiple driver queries — not a second document',
  });
  logQuerySource(orderId, raw.status, raw.deliveryStatus, sources.join('+'), {
    firestorePath: `orders/${orderId}`,
    duplicateQueryMatch: true,
  });
}
