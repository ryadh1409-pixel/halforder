import Constants from 'expo-constants';

/** Shared Google Maps / Places API key for client-side requests. */
export function resolveGoogleMapsApiKey(): string {
  const fromEnv = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
  if (fromEnv) return fromEnv;
  const legacy = process.env.EXPO_PUBLIC_GOOGLE_API_KEY?.trim() ?? '';
  if (legacy) return legacy;
  const extra = Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined;
  return extra?.googleMapsApiKey?.trim() ?? '';
}

export function isGoogleMapsApiKeyConfigured(): boolean {
  return resolveGoogleMapsApiKey().length > 0;
}
