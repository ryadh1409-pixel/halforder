import DriverTabBar from '@/components/driver/DriverTabBar';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React, { memo, useCallback } from 'react';

const DRIVER_TAB_SCREEN_OPTIONS = {
  headerShown: false,
  lazy: true,
} as const;

const TAB_TITLE_INDEX = { title: 'Dashboard' } as const;
const TAB_TITLE_DISPATCH = { title: 'Orders' } as const;
const TAB_TITLE_EARNINGS = { title: 'Earnings' } as const;
const TAB_TITLE_PROFILE = { title: 'Profile' } as const;
const TAB_HIDDEN = { href: null } as const;

/**
 * Memoized tabs shell — no auth/presence/realtime context (avoids update-depth loops).
 */
function DriverTabsNavigator() {
  const renderDriverTabBar = useCallback(
    (props: BottomTabBarProps) => <DriverTabBar {...props} />,
    [],
  );

  return (
    <Tabs
      tabBar={renderDriverTabBar}
      detachInactiveScreens
      screenOptions={DRIVER_TAB_SCREEN_OPTIONS}
    >
      <Tabs.Screen name="index" options={TAB_TITLE_INDEX} />
      <Tabs.Screen name="dispatch" options={TAB_TITLE_DISPATCH} />
      <Tabs.Screen name="earnings" options={TAB_TITLE_EARNINGS} />
      <Tabs.Screen name="profile" options={TAB_TITLE_PROFILE} />
      <Tabs.Screen name="dashboard" options={TAB_HIDDEN} />
      <Tabs.Screen name="active" options={TAB_HIDDEN} />
      <Tabs.Screen name="active/[id]" options={TAB_HIDDEN} />
      <Tabs.Screen name="order/[id]" options={TAB_HIDDEN} />
    </Tabs>
  );
}

export default memo(DriverTabsNavigator);
