import CustomTabBar from '@/components/CustomTabBar';
import { useAuth } from '@/services/AuthContext';
import { Tabs } from 'expo-router';
import React from 'react';

/**
 * Keep every tab route mounted as a `Tabs.Screen` (no conditional `null` children, no remount `key`).
 * Hide role-only tabs with `href: null` so the tab router state stays valid and avoids `stale` crashes.
 */
export default function TabLayout() {
  const { firestoreUserRole } = useAuth();
  const role = firestoreUserRole ?? 'user';
  const showHostTab = role === 'restaurant';
  const showDriverTab = role === 'driver' || role === 'admin';

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} resolvedRole={role} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="home" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="host" options={showHostTab ? {} : { href: null }} />
      <Tabs.Screen name="driver" options={showDriverTab ? {} : { href: null }} />
    </Tabs>
  );
}
