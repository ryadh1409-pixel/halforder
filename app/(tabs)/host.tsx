import HostDashboardScreen from '@/screens/HostDashboardScreen';
import { HOST_TAB_ROLES, useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/services/AuthContext';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Host tab is only registered for `restaurant` / `host` role; redirects run in `useRoleGuard` (not during render). */
export default function HostTabScreen() {
  const { loading } = useAuth();
  const { authorized } = useRoleGuard({
    allowedKey: 'host|restaurant',
    allowedRoles: HOST_TAB_ROLES,
    fallbackHref: '/(tabs)',
  });

  if (loading || !authorized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <HostDashboardScreen />;
}
