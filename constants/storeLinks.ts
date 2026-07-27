import Constants from 'expo-constants';

type StoreExtra = {
  /** Numeric App Store ID only (e.g. 6471234567). Set in app.json → expo.extra. */
  iosAppStoreId?: string;
  /** Optional override; defaults to expo.android.package from app config. */
  androidPlayStorePackage?: string;
};

function readExtra(): StoreExtra {
  return (Constants.expoConfig?.extra ?? {}) as StoreExtra;
}

/** Shared App Store URL for referral, invite, download, and share-app actions. */
export const HALFORDER_APP_STORE_URL =
  'https://apps.apple.com/ca/app/halforder/id6760587041';

/**
 * App Store URL used throughout the app for referral/download sharing.
 */
export function getIosAppStoreUrl(): string {
  return HALFORDER_APP_STORE_URL;
}

/**
 * Play Store listing for the app package from config.
 */
export function getPlayStoreUrl(): string {
  const extra = readExtra();
  const pkg =
    extra.androidPlayStorePackage?.trim() ||
    Constants.expoConfig?.android?.package ||
    'com.anonymous.ourfoodclean';
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`;
}
