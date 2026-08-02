import 'dotenv/config';

import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

type ExpoPlugin = NonNullable<ExpoConfig['plugins']>[number];

function withReactNativeMapsPlugin(
  plugins: ExpoPlugin[] | undefined,
): ExpoPlugin[] {
  const next = [...(plugins ?? [])].filter((plugin) => {
    if (plugin === 'react-native-maps') return false;
    if (Array.isArray(plugin) && plugin[0] === 'react-native-maps') return false;
    return true;
  });

  // Package plugin (maps >= 1.23) injects `pod 'react-native-maps/Google'`.
  // Expo's built-in fallback still injects removed `react-native-google-maps`
  // when ios.config.googleMapsApiKey is set — do not set that field.
  next.push([
    'react-native-maps',
    {
      iosGoogleMapsApiKey: googleMapsApiKey,
      androidGoogleMapsApiKey: googleMapsApiKey,
    },
  ]);

  return next;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  // Strip legacy Expo Maps trigger so the unversioned fallback cannot
  // inject `pod 'react-native-google-maps'` (removed in react-native-maps 1.23+).
  const { googleMapsApiKey: _omitIosGoogleMapsApiKey, ...iosConfigRest } =
    config.ios?.config ?? {};

  return {
    ...config,
    name: config.name ?? 'HalfOrder',
    plugins: withReactNativeMapsPlugin(config.plugins),
    ios: {
      ...config.ios,
      config: {
        ...iosConfigRest,
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        // Prefer plugin props; keep android config for any non-plugin consumers.
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    extra: {
      ...config.extra,
      googleMapsApiKey,
    },
  } as ExpoConfig;
};
