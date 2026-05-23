import { normalizeRoleForRouting } from '@/lib/authRole';
import { isRegisteredAuthUser } from '@/lib/authSession';
import HostDashboardScreen from '@/screens/HostDashboardScreen';
import { useAuth } from '@/services/AuthContext';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Restaurant menu tab — venue menu management (restaurant role only). */
export default function RestaurantMenuTab() {
  const { user, loading, firestoreUserRole } = useAuth();
  const role = normalizeRoleForRouting(loading ? null : firestoreUserRole);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isRegisteredAuthUser(user) || role !== 'restaurant') {
    return <Redirect href="/(tabs)" />;
  }

  return <HostDashboardScreen />;
}
