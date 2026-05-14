import CustomTabBar from '@/components/CustomTabBar';
import { Tabs } from 'expo-router';
import React from 'react';

/**
 * Custom tab bar: `onPress` → `router.navigate(href)` only (see `components/CustomTabBar.tsx`).
 * No `initialRouteName` / `initialLayout` / extra `defaultScreenOptions` here — those can
 * interact badly with lazy tabs.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /** Mount tab screens on demand so inactive tabs do not run effects at startup. */
        lazy: true,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="home" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="host" />
      <Tabs.Screen name="driver" />
    </Tabs>
  );
}
