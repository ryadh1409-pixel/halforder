import DriverTabsNavigator from '@/components/driver/DriverTabsNavigator';
import { DriverPresenceProvider } from '@/contexts/DriverPresenceContext';
import { DriverRealtimeProvider } from '@/contexts/DriverRealtimeContext';
import { DriverShellProvider } from '@/contexts/DriverShellContext';
import { useAuthUid } from '@/hooks/useAuthUid';
import { markDriverStackMounted } from '@/lib/driverStack';
import { ActivityIndicator, View } from 'react-native';
import { useDriverMountLog } from '@/utils/driverMountLog';
import { useEffect } from 'react';

export const unstable_settings = {
  initialRouteName: 'index',
};

/**
 * Driver stack layout: stable provider tree + memoized tabs (Realtime → Presence → Shell → Tabs).
 * Latch driver stack on mount; reset only on sign-out (see lib/driverStack.ts).
 */
export default function DriverLayout() {
  const uid = useAuthUid();
  useDriverMountLog('DriverLayout', uid || null);

  useEffect(() => {
    markDriverStackMounted();
    // Do not clear latch on cleanup — prevents duplicate role redirects during dev StrictMode remount.
  }, []);

  if (!uid) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    );
  }

  return (
    <DriverRealtimeProvider uid={uid}>
      <DriverPresenceProvider uid={uid}>
        <DriverShellProvider>
          <DriverTabsNavigator />
        </DriverShellProvider>
      </DriverPresenceProvider>
    </DriverRealtimeProvider>
  );
}
