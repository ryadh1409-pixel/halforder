import { useHostShellAccess } from '@/hooks/useHostShellAccess';
import { HOST_TAB_HREFS } from '@/lib/navigationPaths';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

const ACTIVE = '#A855F7';
const INACTIVE = '#8A829E';

export const unstable_settings = {
  initialRouteName: 'dashboard',
};

/**
 * Passive restaurant host shell — no navigation side effects.
 * Wrong-role recovery is handled by {@link StartupRedirectOrchestrator} at root.
 *
 * Explicit tab hrefs (same pattern as driver) — bare `/wallet` collides with
 * customer `app/wallet`, and bare `/orders` collides with `app/orders`.
 */
export default function HostLayout() {
  const { canRenderShell, showShellLoading } = useHostShellAccess();

  if (!canRenderShell) {
    return null;
  }

  if (showShellLoading) {
    return (
      <View style={styles.shellLoading}>
        <ActivityIndicator size="large" color={ACTIVE} />
        <Text style={styles.shellLoadingText}>Loading restaurant dashboard…</Text>
      </View>
    );
  }

  return (
    <Tabs
      {...({ id: 'host' } as object)}
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="bank-account" options={{ href: null }} />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          href: HOST_TAB_HREFS.dashboard,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          href: HOST_TAB_HREFS.orders,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          href: HOST_TAB_HREFS.menu,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          href: HOST_TAB_HREFS.wallet,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="wallet-transaction/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  shellLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0816',
  },
  shellLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#8A829E',
    fontWeight: '600',
  },
  tabBar: {
    backgroundColor: '#0B0816',
    borderTopColor: 'rgba(168, 85, 247, 0.22)',
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: 6,
  },
  tabLabel: { fontSize: 11, fontWeight: '700' },
});
