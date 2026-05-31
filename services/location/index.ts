export {
  getCurrentGpsReading,
  getCurrentGpsReadingSafe,
  getCityFromCoordinates,
  getUserLocation,
  getUserLocationSafe,
  gpsReadingToDriverCoord,
  LocationPermissionError,
  LocationUnavailableError,
  requestForegroundLocationPermission,
  reverseGeocodeAddress,
  watchGpsPosition,
  type GpsPermissionStatus,
  type GpsReading,
  type GpsWatchOptions,
} from './gps';

export {
  buildCustomerLocationRecord,
  persistCustomerLocation,
  resolveDeliveryLocationForCheckout,
  type ResolveDeliveryLocationOptions,
} from './customerLocation';

export {
  fetchRestaurantLocation,
  restaurantLocationToLegacy,
  RestaurantLocationMissingError,
} from './restaurantLocation';

export {
  buildDriverLocationFirestorePayload,
  buildDriverLocationRecord,
  DRIVER_LOCATION_MIN_DISTANCE_M,
  DRIVER_LOCATION_WRITE_INTERVAL_MS,
  resetDriverLocationThrottle,
  syncDriverLiveLocation,
} from './driverTracking';
