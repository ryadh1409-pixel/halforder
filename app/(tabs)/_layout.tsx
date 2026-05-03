import CustomTabBar from '@/components/CustomTabBar';
import { useAuth } from '@/services/AuthContext';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  const { firestoreUserRole } = useAuth();
  const role = firestoreUserRole ?? 'user';

  const showHostTab = role === 'restaurant';
  const showDriverTab = role === 'driver' || role === 'admin';

  /** Remount when optional tabs toggle so TabRouter never keeps a focused route that was removed. */
  const tabsKey = `${role}-h${showHostTab ? 1 : 0}-d${showDriverTab ? 1 : 0}`;

  return (
    <Tabs
      key={tabsKey}
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} resolvedRole={role} />}
    >
      {/* Always present — full tab list (no `href: null` / no partial hide). */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="home" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="admin" />

      {/* Conditional tabs */}
      {showHostTab ? <Tabs.Screen name="host" /> : null}
      {showDriverTab ? <Tabs.Screen name="driver" /> : null}
    </Tabs>
  );
}
