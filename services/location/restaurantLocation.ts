import { doc, getDoc } from 'firebase/firestore';

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

  const address =
    typeof data.address === 'string'
      ? data.address
      : data.location &&
          typeof data.location === 'object' &&
          typeof (data.location as { address?: unknown }).address === 'string'
        ? String((data.location as { address: string }).address)
        : null;

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
