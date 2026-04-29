import { requireRole } from '@/utils/requireRole';
import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function AdminLayout() {
  const { loading, authorized } = requireRole(['admin']);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!authorized) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen
        name="food-templates"
        options={{ title: 'Food catalog' }}
      />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="users" options={{ title: 'Users' }} />
      <Stack.Screen name="user/[id]" options={{ title: 'User' }} />
      <Stack.Screen name="orders" options={{ title: 'Orders' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
      <Stack.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
      <Stack.Screen name="report/[id]" options={{ title: 'Report' }} />
      <Stack.Screen name="complaints" options={{ title: 'User Complaints' }} />
      <Stack.Screen
        name="notifications"
        options={{ title: 'Notification Tracking' }}
      />
      <Stack.Screen name="map" options={{ title: 'Activity Map' }} />
      <Stack.Screen name="broadcast" options={{ title: 'Send notification' }} />
      <Stack.Screen name="ai-insights" options={{ title: 'AI Insights' }} />
      <Stack.Screen
        name="test-order-flow"
        options={{ title: 'Order Flow Test' }}
      />
    </Stack>
  );
}
