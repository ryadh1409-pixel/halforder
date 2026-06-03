import Constants from 'expo-constants';

let mapKeyDiagnosticLogged = false;

function readEnvKey(raw: string | undefined): string {
  return raw?.trim().replace(/\s+/g, '') ?? '';
}

/** Shared Google Maps / Places API key for client-side requests. */
export function resolveGoogleMapsApiKey(): string {
  const fromEnv = readEnvKey(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  if (fromEnv) {
    logMapKeyDiagnostic(fromEnv, 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
    return fromEnv;
  }
  const legacy = readEnvKey(process.env.EXPO_PUBLIC_GOOGLE_API_KEY);
  if (legacy) {
    logMapKeyDiagnostic(legacy, 'EXPO_PUBLIC_GOOGLE_API_KEY');
    return legacy;
  }
  const extra = Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined;
  const fromExtra = readEnvKey(extra?.googleMapsApiKey);
  if (fromExtra) {
    logMapKeyDiagnostic(fromExtra, 'expo.extra.googleMapsApiKey');
    return fromExtra;
  }
  logMapKeyDiagnostic('', 'none');
  return '';
}

function logMapKeyDiagnostic(key: string, source: string): void {
  if (mapKeyDiagnosticLogged) return;
  mapKeyDiagnosticLogged = true;
  // Temporary env debug — remove after verifying .env loads in Expo
  console.log('GOOGLE KEY:', process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  console.log('HAS KEY:', !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  console.log('[MAP KEY]', key.length > 0 ? key.slice(0, 8) : '(missing)');
  console.log('[MAP KEY LENGTH]', key.length);
  console.log('[MAP KEY SOURCE]', source);
  console.log('[MAP KEY FORMAT OK]', key.startsWith('AIza') && key.length >= 35);
  if (key.length > 0 && !key.startsWith('AIza')) {
    console.warn('[MAP KEY] Unexpected format — Google API keys usually start with AIza');
  }
}

export function isGoogleMapsApiKeyConfigured(): boolean {
  return resolveGoogleMapsApiKey().length > 0;
}
