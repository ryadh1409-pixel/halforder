import { doc, getDoc } from 'firebase/firestore';

import { parseRestaurantDeliveryLocation } from '@/lib/location/restaurantDeliveryLocation';
import { extractRestaurantCoords } from '@/lib/restaurantStoreMetrics';
import type { RestaurantLocationRecord } from '@/types/location';
import { db } from '@/services/firebase';

export class RestaurantLocationMissingError extends Error {
  constructor(restaurantId: string) {
    super(
      `Restaurant "${restaurantId}" has no GPS coordinates configured. Ask the restaurant to set their location.`,
    );
    this.name = 'RestaurantLocationMissingError';
  }
}

/** Fetch real restaurant coordinates from Firestore — never synthesizes offsets. */
export async function fetchRestaurantLocation(
  restaurantId: string,
): Promise<RestaurantLocationRecord> {
  const id = restaurantId.trim();
  if (!id) {
    throw new RestaurantLocationMissingError(restaurantId);
  }

  const snap = await getDoc(doc(db, 'restaurants', id));
  if (!snap.exists()) {
    throw new RestaurantLocationMissingError(id);
  }

  const data = snap.data() as Record<string, unknown>;
  const coords = extractRestaurantCoords(data);
  if (!coords) {
    throw new RestaurantLocationMissingError(id);
  }

  const venue = parseRestaurantDeliveryLocation(data);
  const address =
    venue?.address ??
    (typeof data.address === 'string' ? data.address : null);

  return {
    latitude: coords.lat,
    longitude: coords.lng,
    address,
  };
}

/** Legacy `{ lat, lng }` shape for existing order fields. */
export function restaurantLocationToLegacy(record: RestaurantLocationRecord): {
  lat: number;
  lng: number;
} {
  return { lat: record.latitude, lng: record.longitude };
}
