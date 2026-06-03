import { Platform } from 'react-native';

import { clearDeliveryLocationCache } from '@/services/location/locationLocalCache';

let didClearOnStartup = false;

/** Clear stale AsyncStorage location cache once per app process (TestFlight / device). */
export async function clearDeliveryLocationCacheOnStartup(): Promise<void> {
  if (Platform.OS === 'web' || didClearOnStartup) return;
  didClearOnStartup = true;
  await clearDeliveryLocationCache({ log: true, reason: 'app_startup' });
}
