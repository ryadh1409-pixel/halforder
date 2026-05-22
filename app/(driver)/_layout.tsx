import { ensureAuthRoleClaim } from '@/services/authRoleClaims';
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';

export default function DriverLayout() {
  useEffect(() => {
    void ensureAuthRoleClaim('driver');
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="active" options={{ href: null }} />
      <Tabs.Screen name="order/[id]" options={{ href: null }} />
    </Tabs>
  );
}
