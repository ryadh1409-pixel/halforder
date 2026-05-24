import { HOST_TAB_HREFS } from '@/lib/navigationPaths';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

const ACTIVE = '#16a34a';
const INACTIVE = '#64748b';

export const unstable_settings = {
  initialRouteName: 'dashboard',
};

export default function HostLayout() {
  const { user, loading, firestoreUserRole } = useAuth();
  const role = normalizeRoleForRouting(loading ? null : firestoreUserRole);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ACTIVE} />
      </View>
    );
  }

  if (!isRegisteredAuthUser(user) || role !== 'restaurant') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
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
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: {
    backgroundColor: '#fff',
    borderTopColor: '#e2e8f0',
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: 6,
  },
  tabLabel: { fontSize: 11, fontWeight: '700' },
});
