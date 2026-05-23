import AppLogo from '@/components/AppLogo';
import { useAuth } from '@/services/AuthContext';
import React, { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

type AuthBootstrapGateProps = {
  children: ReactNode;
};

/**
 * Blocks navigation tree until Firebase auth + Firestore role have settled.
 * Prevents Slot from rendering the wrong shell and then replacing it (extra remounts).
 */
export function AuthBootstrapGate({ children }: AuthBootstrapGateProps) {
  const { loading, authReady, roleResolved } = useAuth();
  const bootstrapReady = authReady && roleResolved && !loading;

  if (!bootstrapReady) {
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
