import CustomTabBar from '@/components/CustomTabBar';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { TABS_ROUTES } from '@/lib/navigationPaths';
import { useAuth } from '@/services/AuthContext';
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';

/**
 * Custom tab bar: `onPress` → `router.navigate(href)` only (see `components/CustomTabBar.tsx`).
 * No `initialRouteName` / `initialLayout` / extra `defaultScreenOptions` here — those can
 * interact badly with lazy tabs.
 */
export default function TabLayout() {
  const { firestoreUserRole, loading } = useAuth();
  const role = useMemo(
    () => normalizeRoleForRouting(loading ? null : firestoreUserRole),
    [firestoreUserRole, loading],
  );
  const isDriver = role === 'driver';

  return (
    <Tabs
      id="main"
      screenOptions={{
        headerShown: false,
        /** Mount tab screens on demand so inactive tabs do not run effects at startup. */
        lazy: true,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ href: TABS_ROUTES.hub }} />
      <Tabs.Screen name="swipe" options={{ href: TABS_ROUTES.swipe }} />
      <Tabs.Screen name="explore" options={{ href: TABS_ROUTES.explore }} />
      <Tabs.Screen name="search" options={{ href: TABS_ROUTES.search }} />
      <Tabs.Screen name="cart" options={{ href: TABS_ROUTES.cart }} />
      <Tabs.Screen name="ai" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: TABS_ROUTES.orders }} />
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          href: isDriver ? null : TABS_ROUTES.profile,
        }}
      />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="host" />
      <Tabs.Screen name="driver" options={{ href: TABS_ROUTES.driverEntry }} />
    </Tabs>
  );
}
