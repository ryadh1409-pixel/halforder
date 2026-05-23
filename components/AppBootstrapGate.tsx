import AppLogo from '@/components/AppLogo';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useDevProviderMount } from '@/utils/devBootstrapDiagnostics';
import { logRootBootstrapState } from '@/utils/driverLifecycleLog';
import { usePathname, useSegments } from 'expo-router';
import React, { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export type BootstrapPhase =
  | 'idle'
  | 'bootstrapping'
  | 'authReady'
  | 'roleReady'
  | 'appReady';

type AppBootstrapGateProps = {
  children: ReactNode;
};

function resolvePhase(
  appReadyLatched: boolean,
  authReady: boolean,
  roleResolved: boolean,
  loading: boolean,
  hasUser: boolean,
): BootstrapPhase {
  if (appReadyLatched) return 'appReady';
  if (!hasUser) {
    if (!authReady || loading) return 'bootstrapping';
    /** Signed out — auth settled; show router (login, register, etc.). */
    return 'appReady';
  }
  if (!authReady || loading) return 'bootstrapping';
  if (!roleResolved) return 'roleReady';
  return 'appReady';
}

/**
 * Single bootstrap gate for the Expo Router tree.
 * Latches `appReady` so transient `loading` flicker does not unmount Slot / driver providers.
 */
export function AppBootstrapGate({ children }: AppBootstrapGateProps) {
  useDevProviderMount('AppBootstrapGate');

  const pathname = usePathname();
  const segments = useSegments();
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();
  const [appReadyLatched, setAppReadyLatched] = useState(false);

  const hasUser = isRegisteredAuthUser(user);
  const phase = resolvePhase(appReadyLatched, authReady, roleResolved, loading, hasUser);

  useEffect(() => {
    if (!isRegisteredAuthUser(user)) {
      setAppReadyLatched(false);
      return;
    }
    if (authReady && roleResolved && !loading) {
      setAppReadyLatched(true);
    }
  }, [user?.uid, authReady, roleResolved, loading]);

  useEffect(() => {
    logRootBootstrapState({
      pathname,
      segments: segments as string[],
      role: firestoreUserRole ?? null,
      authReady,
      roleResolved,
      uid: user?.uid ?? null,
      loading,
      bootstrapPhase: phase,
      reason: appReadyLatched ? 'latched' : 'waiting',
    });
  }, [
    pathname,
    segments,
    firestoreUserRole,
    authReady,
    roleResolved,
    user?.uid,
    loading,
    phase,
    appReadyLatched,
  ]);

  if (phase !== 'appReady') {
    return (
      <View style={styles.splash}>
        <AppLogo size={112} marginTop={0} />
        <ActivityIndicator size="large" style={styles.spinner} />
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    backgroundColor: '#0F172A',
  },
  spinner: { marginTop: 40 },
});
