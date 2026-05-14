/**
 * Statuses used for AI / assistant "join discovery" and `public_matchable_orders` sync.
 * Must stay aligned with `joinGrowthDiscoveryStatusOk` in `firestore.rules` and
 * `syncPublicMatchableOrder` in `main/src/publicMatchableSync.ts`.
 */
export const JOIN_DISCOVERY_ORDER_STATUSES = [
  'open',
  'active',
  'waiting',
  'matched',
  'pending',
  'full',
] as const;

export type JoinDiscoveryOrderStatus = (typeof JOIN_DISCOVERY_ORDER_STATUSES)[number];
