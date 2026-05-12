import CustomTabBar from '@/components/CustomTabBar';
import { useAuth } from '@/services/AuthContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React, { useCallback, useMemo } from 'react';

/**
 * Keep every tab route mounted as a `Tabs.Screen` (no conditional `null` children, no remount `key`).
 * Hide role-only tabs with `href: null` so the tab router state stays valid and avoids `stale` crashes.
 */
export default function TabLayout() {
  const { loading, firestoreUserRole } = useAuth();
  const resolvedRole = useMemo(() => {
    if (loading) return 'user';
    return firestoreUserRole ?? 'user';
  }, [loading, firestoreUserRole]);

  const showHostTab = resolvedRole === 'restaurant' || resolvedRole === 'host';
  const showDriverTab = resolvedRole === 'driver' || resolvedRole === 'admin';

  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => (
      <CustomTabBar {...props} resolvedRole={resolvedRole} />
    ),
    [resolvedRole],
  );

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
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
