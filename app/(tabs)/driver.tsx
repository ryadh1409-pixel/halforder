import { DRIVER_TAB_ROLES } from '@/services/roles';
import { useAuth } from '@/services/AuthContext';
import type { UserRole } from '@/services/userService';
import { Redirect } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

const DRIVER_STACK_HREF = '/(driver)' as const;

/**
 * Main-tabs driver entry: redirect into the canonical driver stack so
 * `DriverPresenceProvider` in `app/(driver)/_layout.tsx` wraps all driver UI.
 */
export default function DriverTabScreen() {
  const { user, loading, firestoreUserRole } = useAuth();
  const effectiveRole = (firestoreUserRole ?? 'user') as UserRole;
  const authorized = useMemo(
    () => !loading && Boolean(user) && DRIVER_TAB_ROLES.includes(effectiveRole),
    [user, loading, effectiveRole],
  );

  if (loading || !authorized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={DRIVER_STACK_HREF} />;
}
