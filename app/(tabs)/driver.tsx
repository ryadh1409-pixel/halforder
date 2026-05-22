import { DRIVER_TAB_ROLES } from '@/services/roles';
import { useAuth } from '@/services/AuthContext';
import type { UserRole } from '@/services/userService';
import { logRouteRedirect } from '@/utils/routeDiagnostics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

const DRIVER_STACK_HREF = '/(driver)' as const;

/**
 * Main-tabs driver entry: one-time redirect into canonical `/(driver)` stack.
 */
export default function DriverTabScreen() {
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const { user, loading, firestoreUserRole } = useAuth();
  const effectiveRole = (firestoreUserRole ?? 'user') as UserRole;
  const authorized = useMemo(
    () => !loading && Boolean(user) && DRIVER_TAB_ROLES.includes(effectiveRole),
    [user, loading, effectiveRole],
  );

  useEffect(() => {
    if (!authorized || hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    logRouteRedirect('/(tabs)/driver', DRIVER_STACK_HREF);
    router.replace(DRIVER_STACK_HREF);
  }, [authorized, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
