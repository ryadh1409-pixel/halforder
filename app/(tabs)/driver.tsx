import { DRIVER_TAB_ROLES, useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/services/AuthContext';
import DriverHubScreen from '../(driver)/index';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Driver tab is only registered for `driver` / `admin`; redirects run in an effect (never during render). */
export default function DriverTabScreen() {
  const { loading } = useAuth();
  const { authorized } = useRoleGuard({
    allowedKey: 'admin|driver',
    allowedRoles: DRIVER_TAB_ROLES,
    fallbackHref: '/(tabs)',
  });

  if (loading || !authorized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <DriverHubScreen />;
}
