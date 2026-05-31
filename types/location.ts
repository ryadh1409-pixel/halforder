/**
 * Canonical Firestore location schemas for production GPS tracking.
 * Legacy `{ lat, lng }` fields remain readable via `lib/location/coordinates`.
 */

/** Customer GPS snapshot on orders + users. */
export type CustomerLocationRecord = {
  latitude: number;
  longitude: number;
  timestamp: unknown;
};

/** Driver live GPS on orders, drivers, live_locations. */
export type DriverLocationRecord = {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  timestamp: unknown;
};

/** Restaurant static location on restaurants collection. */
export type RestaurantLocationRecord = {
  latitude: number;
  longitude: number;
  address?: string | null;
};

/** Normalized in-app coordinate (maps + distance). */
export type GeoCoordinate = {
  latitude: number;
  longitude: number;
};

export type DriverLiveCoordinate = GeoCoordinate & {
  heading?: number | null;
  speed?: number | null;
};

/** Delivery address bundle for order create. */
export type DeliveryAddressBundle = {
  lat: number;
  lng: number;
  address: string;
  customerLocation: CustomerLocationRecord;
};
