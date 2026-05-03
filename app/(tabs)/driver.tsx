import { useAuth } from '@/services/AuthContext';
import DriverHubScreen from '../(driver)/index';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Driver tab is only registered for `driver` / `admin`; guards stale navigation to this route. */
export default function DriverTabScreen() {
  const { firestoreUserRole, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (firestoreUserRole !== 'driver' && firestoreUserRole !== 'admin') {
    return <Redirect href="/(tabs)" />;
  }

  return <DriverHubScreen />;
}
