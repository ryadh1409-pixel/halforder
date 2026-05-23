import CustomTabBar from '@/components/CustomTabBar';
import { tabHrefForRole, resolveTabsShellRole } from '@/lib/tabsRoleVisibility';
import { TABS_ROUTES } from '@/lib/navigationPaths';
import { useAuth } from '@/services/AuthContext';
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';

const HIDDEN_TAB = { href: null } as const;

/**
 * Custom tab bar: `onPress` → `router.navigate(href)` only (see `components/CustomTabBar.tsx`).
 * Tab visibility is role-scoped via `href: null` (driver never uses this navigator).
 */
export default function TabLayout() {
  const { firestoreUserRole, loading } = useAuth();
  const role = useMemo(
    () => resolveTabsShellRole(firestoreUserRole, loading),
    [firestoreUserRole, loading],
  );

  const customerTabs = { allow: ['user', 'admin'] as const };
  const restaurantTabs = { allow: ['restaurant'] as const };

  return (
    <Tabs
      id="main"
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.hub, customerTabs),
        }}
      />
      <Tabs.Screen
        name="swipe"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.swipe, customerTabs),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.explore, customerTabs),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.search, customerTabs),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.cart, customerTabs),
        }}
      />
      <Tabs.Screen name="ai" options={HIDDEN_TAB} />
      <Tabs.Screen
        name="orders"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.orders, restaurantTabs),
        }}
      />
      <Tabs.Screen name="home" options={HIDDEN_TAB} />
      <Tabs.Screen
        name="profile"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.profile, {
            allow: ['user', 'admin', 'restaurant'],
          }),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: tabHrefForRole(role, '/(tabs)/admin' as const, {
            allow: ['admin'],
          }),
        }}
      />
      <Tabs.Screen
        name="host"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.host, restaurantTabs),
        }}
      />
      <Tabs.Screen name="driver" options={HIDDEN_TAB} />
      <Tabs.Screen
        name="menu"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.menu, restaurantTabs),
        }}
      />
    </Tabs>
  );
}
