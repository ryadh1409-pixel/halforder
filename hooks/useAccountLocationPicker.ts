/**
 * Unified account location stack — UI in {@link AccountLocationPicker}.
 * @see useAccountSavedLocation
 * @see useLocationSearch from `@/services/location/useLocationSearch`
 */
export { useAccountSavedLocation } from '@/hooks/useAccountSavedLocation';
export { useLocationSearch } from '@/services/location/useLocationSearch';
export {
  getAccountLocationRoleConfig,
  logRoleGps,
  type AccountLocationRole,
} from '@/services/location/accountLocationRole';
