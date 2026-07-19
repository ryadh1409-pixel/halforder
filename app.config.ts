import 'dotenv/config';

import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
const openaiApiKey =
  process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() ||
  process.env.OPENAI_API_KEY?.trim() ||
  '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'HalfOrder',
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
    openaiApiKey,
  },
}) as ExpoConfig;
