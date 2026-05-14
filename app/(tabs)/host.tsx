import HostDashboardScreen from '@/screens/HostDashboardScreen';
import { HOST_TAB_ROLES } from '@/services/roles';
import { useAuth } from '@/services/AuthContext';
import type { UserRole } from '@/services/userService';
import React, { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Host tab: wrong-role UI only; role landing from `/` is in `app/_layout.tsx`. */
export default function HostTabScreen() {
  const { user, loading, firestoreUserRole } = useAuth();
  const effectiveRole = (firestoreUserRole ?? 'user') as UserRole;
  const authorized = useMemo(
    () => !loading && Boolean(user) && HOST_TAB_ROLES.includes(effectiveRole),
    [user, loading, effectiveRole],
  );

  if (loading || !authorized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <HostDashboardScreen />;
}
