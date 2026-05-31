import 'dotenv/config';

import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ios: {
    ...config.ios,
    config: {
      ...(config.ios?.config ?? {}),
      googleMapsApiKey,
    },
  },
  extra: {
    ...config.extra,
    googleMapsApiKey,
  },
});
