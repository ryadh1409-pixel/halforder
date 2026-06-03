import 'dotenv/config';

import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

if (process.env.NODE_ENV !== 'production') {
  console.log('[app.config] GOOGLE KEY:', process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  console.log('[app.config] HAS KEY:', !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  console.log('[app.config] KEY LENGTH:', googleMapsApiKey.length);
  console.log(
    '[app.config] FORMAT OK:',
    googleMapsApiKey.startsWith('AIza') && googleMapsApiKey.length >= 35,
  );
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ios: {
    ...config.ios,
    config: {
      ...(config.ios?.config ?? {}),
      googleMapsApiKey,
    },
  },
  android: {
    ...config.android,
    config: {
      ...(config.android?.config ?? {}),
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
  extra: {
    ...config.extra,
    googleMapsApiKey,
  },
});
