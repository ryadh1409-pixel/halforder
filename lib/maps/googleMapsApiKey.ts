import Constants from 'expo-constants';

function readEnvKey(raw: string | undefined): string {
  return raw?.trim().replace(/\s+/g, '') ?? '';
}

/** Shared Google Maps / Places API key for client-side requests. */
export function resolveGoogleMapsApiKey(): string {
  const fromEnv = readEnvKey(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  if (fromEnv) return fromEnv;
  const legacy = readEnvKey(process.env.EXPO_PUBLIC_GOOGLE_API_KEY);
  if (legacy) return legacy;
  const extra = Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined;
  const fromExtra = readEnvKey(extra?.googleMapsApiKey);
  if (fromExtra) return fromExtra;
  return '';
}

export function isGoogleMapsApiKeyConfigured(): boolean {
  return resolveGoogleMapsApiKey().length > 0;
}
