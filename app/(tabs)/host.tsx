import HostDashboardScreen from '@/screens/HostDashboardScreen';
import { useAuth } from '@/services/AuthContext';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Host tab is only registered for `restaurant` role; this guards deep links and role transitions. */
export default function HostTabScreen() {
  const { firestoreUserRole, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (firestoreUserRole !== 'restaurant') {
    return <Redirect href="/(tabs)" />;
  }

  return <HostDashboardScreen />;
}
