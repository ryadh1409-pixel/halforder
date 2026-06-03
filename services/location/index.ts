export {
  FRESH_GPS_OPTIONS,
  getCurrentGpsReading,
  getCurrentGpsReadingSafe,
  getForegroundPermissionStatus,
  getFreshHighAccuracyGpsReading,
  getCityFromCoordinates,
  getUserLocation,
  getUserLocationSafe,
  gpsReadingToDriverCoord,
  isGpsPositionStale,
  LIVE_GPS_PRECISE_ERROR,
  LocationPermissionError,
  LocationUnavailableError,
  MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
  requestForegroundLocationPermission,
  reverseGeocodeAddress,
  watchGpsPosition,
  type GpsPermissionStatus,
  type GpsReading,
  type GpsWatchOptions,
} from './gps';

export { clearDeliveryLocationCacheOnStartup } from './startupLocationCache';

export {
  runAppLaunchLocationReconcile,
  type AppLaunchLocationParams,
} from './appLaunchLocationReconcile';

export {
  BACKGROUND_GPS_REFRESH_AFTER_MS,
  markAppBackgrounded,
  runBackgroundLocationRefresh,
} from './backgroundLocationRefresh';

export {
  buildAccountLocationReconcileTargets,
  runSilentAccountLocationReconcile,
  type AccountLocationReconcileParams,
} from './accountLocationReconcile';

export {
  runDedupedGpsRequest,
  shouldAllowUserGpsTap,
  USER_GPS_TAP_DEBOUNCE_MS,
} from './gpsRequestGate';

export {
  claimProfileLocationBootstrap,
  profileLocationBootstrapKey,
  releaseProfileLocationBootstrap,
} from './locationBootstrapGuard';

export {
  getAccountLocationRoleConfig,
  logRoleGps,
  type AccountLocationRole,
  type AccountLocationRoleConfig,
} from './accountLocationRole';

export {
  syncDriverProfileBaseLocation,
} from './driverTracking';

export type { SaveAccountLocationOptions } from './savedLocationFirestore';

export {
  buildCustomerLocationRecord,
  persistCustomerLocation,
  resolveDeliveryLocationForCheckout,
  type ResolveDeliveryLocationOptions,
} from './customerLocation';

export {
  resolveAddressFromGps,
  savedLocationFromGpsResolve,
  type ResolvedAddressFromGps,
} from './resolveAddressFromGps';

export {
  fetchRestaurantLocation,
  restaurantLocationToLegacy,
  RestaurantLocationMissingError,
} from './restaurantLocation';

export {
  useLocationSearch,
  type LocationSearchGpsState,
} from './useLocationSearch';

export {
  fetchFreshGpsSavedLocation,
  savedLocationDiffersFromGps,
  type FreshGpsLocationResult,
} from './reconcileSavedWithGps';

export {
  assessLocationPermission,
  getProductionGpsReading,
  GPS_IMPROVING_MESSAGE,
  MAX_HORIZONTAL_ACCURACY_M,
  reconcileProfileLocationIfUserMoved,
  refreshGpsIfAllowed,
  resolveDeliveryLocationForOrder,
  resolveProductionGpsSavedLocation,
  type DeliveryLocationResolveOptions,
  type LocationPermissionAssessment,
} from './productionGps';

export {
  claimGpsRefreshSession,
  getSessionGpsReading,
  releaseGpsRefreshSession,
  resetGpsSessionCache,
  setSessionGpsReading,
} from './gpsSession';

export {
  clearDeliveryLocationCache,
  isCachedGpsBiasStale,
  readLiveGpsBiasCache,
  refreshLiveGpsBiasCache,
  setLiveGpsBiasCache,
  type CachedLiveGpsBias,
} from './locationLocalCache';

export {
  fetchSavedLocationFromServer,
  parseSavedLocation,
  readSavedLocationFromDoc,
  saveAccountSavedLocation,
  type ServerSavedLocationResult,
} from './savedLocationFirestore';

export {
  buildDriverLocationFirestorePayload,
  buildDriverLocationRecord,
  DRIVER_LOCATION_MIN_DISTANCE_M,
  DRIVER_LOCATION_WRITE_INTERVAL_MS,
  resetDriverLocationThrottle,
  syncDriverLiveLocation,
} from './driverTracking';
