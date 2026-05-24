import CustomTabBar from '@/components/CustomTabBar';
import { useCustomerTabsAccess } from '@/hooks/useCustomerTabsAccess';
import { tabHrefForRole } from '@/lib/tabsRoleVisibility';
import { TABS_ROUTES } from '@/lib/navigationPaths';
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';

const HIDDEN_TAB = { href: null } as const;

/**
 * Passive customer tab shell — no navigation side effects.
 * Wrong-role recovery is handled by {@link StartupRedirectOrchestrator} at root.
 */
export default function TabLayout() {
  const { canMountTabs, role } = useCustomerTabsAccess();
  const customerTabs = useMemo(() => ({ allow: ['user', 'admin'] as const }), []);

  if (!canMountTabs) {
    return null;
  }

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
      <Tabs.Screen name="orders" options={HIDDEN_TAB} />
      <Tabs.Screen name="home" options={HIDDEN_TAB} />
      <Tabs.Screen
        name="profile"
        options={{
          href: tabHrefForRole(role, TABS_ROUTES.profile, {
            allow: ['user', 'admin'],
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
      <Tabs.Screen name="host" options={HIDDEN_TAB} />
      <Tabs.Screen name="driver" options={HIDDEN_TAB} />
      <Tabs.Screen name="menu" options={HIDDEN_TAB} />
    </Tabs>
  );
}
