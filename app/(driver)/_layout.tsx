import DriverTabBar from '@/components/driver/DriverTabBar';
import { DriverShellProvider } from '@/contexts/DriverShellContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { useDriverMountLog } from '@/utils/driverMountLog';

const DRIVER_TAB_SCREEN_OPTIONS = {
  headerShown: false,
  lazy: false,
} as const;

export const unstable_settings = {
  initialRouteName: 'index',
};

/** All `/(driver)` tab screens render inside driver providers (stable, unconditional). */
export default function DriverLayout() {
  useDriverMountLog('DriverLayout');
  const screenOptions = useMemo(() => DRIVER_TAB_SCREEN_OPTIONS, []);
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <DriverTabBar {...props} />,
    [],
  );

  return (
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
  );
}
