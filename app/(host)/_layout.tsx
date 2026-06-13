import { useHostShellAccess } from '@/hooks/useHostShellAccess';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

const ACTIVE = '#16a34a';
const INACTIVE = '#64748b';

export const unstable_settings = {
  initialRouteName: 'dashboard',
};

/**
 * Passive restaurant host shell — no navigation side effects.
 * Wrong-role recovery is handled by {@link StartupRedirectOrchestrator} at root.
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
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  shellLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  shellLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  tabBar: {
    backgroundColor: '#fff',
    borderTopColor: '#e2e8f0',
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: 6,
  },
  tabLabel: { fontSize: 11, fontWeight: '700' },
});
