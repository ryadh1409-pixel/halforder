import DriverTabBar from '@/components/driver/DriverTabBar';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React, { memo, useCallback } from 'react';

const DRIVER_TABS_ID = 'driver' as const;

const DRIVER_TAB_SCREEN_OPTIONS = {
  headerShown: false,
  lazy: true,
} as const;

/** Explicit hrefs — never bare `/profile` (collides with `(tabs)`). */
const TAB_INDEX = { title: 'Dashboard', href: '/(driver)' as const };
const TAB_DISPATCH = { title: 'Orders', href: '/(driver)/dispatch' as const };
const TAB_EARNINGS = { title: 'Earnings', href: '/(driver)/earnings' as const };
const TAB_DRIVER_PROFILE = {
  href: '/(driver)/driver-profile' as const,
  tabBarLabel: 'Profile',
  title: 'Profile',
};
const TAB_HIDDEN = { href: null } as const;

/**
 * Isolated driver tab navigator (`id="driver"`) — separate from `(tabs)` tab state.
 */
function DriverTabsNavigator() {
  const renderDriverTabBar = useCallback(
    (props: BottomTabBarProps) => <DriverTabBar {...props} />,
    [],
  );

  return (
    <Tabs
      id={DRIVER_TABS_ID}
      tabBar={renderDriverTabBar}
      detachInactiveScreens
      screenOptions={DRIVER_TAB_SCREEN_OPTIONS}
    >
      <Tabs.Screen name="index" options={TAB_INDEX} />
      <Tabs.Screen name="dispatch" options={TAB_DISPATCH} />
      <Tabs.Screen name="earnings" options={TAB_EARNINGS} />
      <Tabs.Screen name="driver-profile" options={TAB_DRIVER_PROFILE} />
      <Tabs.Screen name="dashboard" options={TAB_HIDDEN} />
      <Tabs.Screen name="active" options={TAB_HIDDEN} />
      <Tabs.Screen name="active/[id]" options={TAB_HIDDEN} />
      <Tabs.Screen name="order/[id]" options={TAB_HIDDEN} />
    </Tabs>
  );
}

export default memo(DriverTabsNavigator);
