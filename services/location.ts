/**
 * Backward-compatible re-exports — prefer `@/services/location` submodules for new code.
 */
export {
  getCityFromCoordinates,
  getCurrentGpsReading,
  getCurrentGpsReadingSafe,
  getUserLocation,
  getUserLocationSafe,
  fetchRestaurantLocation,
  RestaurantLocationMissingError,
  LocationPermissionError,
  LocationUnavailableError,
  requestForegroundLocationPermission,
  reverseGeocodeAddress,
  resolveDeliveryLocationForCheckout,
  syncDriverLiveLocation,
  watchGpsPosition,
} from './location/index';
