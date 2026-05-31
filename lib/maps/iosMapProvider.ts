import { Platform, UIManager } from 'react-native';
import { PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';

import { isGoogleMapsApiKeyConfigured } from './googleMapsApiKey';

type MapProvider = typeof PROVIDER_DEFAULT | typeof PROVIDER_GOOGLE;

/** True when the native AIRGoogleMap view manager is linked in the dev client binary. */
export function isGoogleMapNativeModuleInstalled(): boolean {
  if (Platform.OS !== 'ios') return false;
  return UIManager.hasViewManagerConfig('AIRGoogleMap');
}

/**
 * Native iOS dev/production builds use Google Maps when the API key is configured
 * and the Google Maps pod is linked. Falls back to Apple Maps when the native
 * module is missing (e.g. stale binary — run `npx expo run:ios` after pod install).
 */
export function getNativeMapProvider(): MapProvider | undefined {
  if (Platform.OS !== 'ios') return undefined;
  if (!isGoogleMapsApiKeyConfigured()) return PROVIDER_DEFAULT;
  if (!isGoogleMapNativeModuleInstalled()) return PROVIDER_DEFAULT;
  return PROVIDER_GOOGLE;
}

export function isGoogleMapsConfiguredOnIos(): boolean {
  return (
    Platform.OS === 'ios' &&
    isGoogleMapsApiKeyConfigured() &&
    isGoogleMapNativeModuleInstalled()
  );
}
