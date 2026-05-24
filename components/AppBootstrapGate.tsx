import AppLogo from '@/components/AppLogo';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useDevProviderMount } from '@/utils/devBootstrapDiagnostics';
import { logBoot } from '@/utils/startupDiagnostics';
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
    return 'appReady';
  }
  if (!authReady || loading) return 'bootstrapping';
  if (!roleResolved) return 'roleReady';
  return 'appReady';
}

/**
 * Gates on Firebase auth + role only — never on router segments.
 * Slot must mount so Expo Router can navigate away from `/`.
 */
export function AppBootstrapGate({ children }: AppBootstrapGateProps) {
  useDevProviderMount('AppBootstrapGate');

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
    if (phase === 'appReady') {
      logBoot('phase-ready', {
        uid: user?.uid ?? null,
        role: firestoreUserRole ?? null,
        authReady,
        roleResolved,
      });
    }
  }, [phase, authReady, roleResolved, firestoreUserRole, user?.uid]);

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
