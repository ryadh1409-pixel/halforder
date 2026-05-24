import { RoleShellLayoutGuard } from '@/components/layout/RoleShellLayoutGuard';
import { HOST_TAB_HREFS } from '@/lib/navigationPaths';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

const ACTIVE = '#16a34a';
const INACTIVE = '#64748b';

export const unstable_settings = {
  initialRouteName: 'dashboard',
};

export default function HostLayout() {
  return (
    <RoleShellLayoutGuard shell="host">
      <Tabs
        id="host"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="storefront-outline" size={size} color={color} />
            ),
            href: HOST_TAB_HREFS.dashboard,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="receipt-outline" size={size} color={color} />
            ),
            href: HOST_TAB_HREFS.orders,
          }}
        />
        <Tabs.Screen
          name="menu"
          options={{
            title: 'Menu',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="restaurant-outline" size={size} color={color} />
            ),
            href: HOST_TAB_HREFS.menu,
          }}
        />
      </Tabs>
    </RoleShellLayoutGuard>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopColor: '#e2e8f0',
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: 6,
  },
  tabLabel: { fontSize: 11, fontWeight: '700' },
});
