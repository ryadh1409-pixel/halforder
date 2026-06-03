export {
  FRESH_GPS_OPTIONS,
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
  CURRENT_LOCATION_LABEL,
  resolveAddressFromGps,
  type ResolvedAddressFromGps,
} from './resolveAddressFromGps';

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
