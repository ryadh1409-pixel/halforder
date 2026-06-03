import { logLocationDebug } from '@/lib/location/locationDebugLog';
import { attachNormalizedRestaurantCoords } from '@/lib/location/restaurantMarketplaceCoords';

/**
 * Normalize a Firestore `restaurants/{id}` snapshot for marketplace distance + cards.
 * Sets `normalizedCoords` — the only field marketplace distance math should read.
 */
export function normalizeRestaurantFirestoreDoc(
  id: string,
  data: Record<string, unknown>,
): Record<string, unknown> & { normalizedCoords: { lat: number; lng: number } | null } {
  logLocationDebug('[RAW RESTAURANT DOC]', { id, ...data });
  return attachNormalizedRestaurantCoords(id, data);
}
