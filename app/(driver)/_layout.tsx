import DriverTabBar from '@/components/driver/DriverTabBar';
import { DriverPresenceProvider } from '@/contexts/DriverPresenceContext';
import { DriverRealtimeProvider } from '@/contexts/DriverRealtimeContext';
import { DriverShellProvider } from '@/contexts/DriverShellContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { useAuth } from '@/services/AuthContext';
import { useDriverMountLog } from '@/utils/driverMountLog';

const DRIVER_TAB_SCREEN_OPTIONS = {
  headerShown: false,
  lazy: false,
} as const;

export const unstable_settings = {
  initialRouteName: 'index',
};

/**
 * All `/(driver)` tab screens inside providers (stateless re: auth token refresh).
 * Nesting: Realtime → Presence → Shell → Tabs.
 */
export default function DriverLayout() {
  const uid = useAuth().user?.uid?.trim() ?? '';
  useDriverMountLog('DriverLayout', uid || null);
  const screenOptions = useMemo(() => DRIVER_TAB_SCREEN_OPTIONS, []);
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <DriverTabBar {...props} />,
    [],
  );

  return (
    <DriverRealtimeProvider>
      <DriverPresenceProvider>
        <DriverShellProvider>
          <Tabs
            tabBar={renderTabBar}
            detachInactiveScreens={false}
            screenOptions={screenOptions}
          >
            <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
            <Tabs.Screen name="dispatch" options={{ title: 'Orders' }} />
            <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
            <Tabs.Screen name="dashboard" options={{ href: null }} />
            <Tabs.Screen name="active" options={{ href: null }} />
            <Tabs.Screen name="active/[id]" options={{ href: null }} />
            <Tabs.Screen name="order/[id]" options={{ href: null }} />
          </Tabs>
        </DriverShellProvider>
      </DriverPresenceProvider>
    </DriverRealtimeProvider>
  );
}
