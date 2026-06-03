import AppLogo from '@/components/AppLogo';
import { BootstrapProvider, useBootstrap } from '@/contexts/BootstrapContext';
import { isBootstrapInteractive } from '@/lib/startup/bootstrapMachine';
import { useDevProviderMount } from '@/utils/devBootstrapDiagnostics';
import { logBoot } from '@/utils/startupDiagnostics';
import { clearDeliveryLocationCacheOnStartup } from '@/services/location/startupLocationCache';
import React, { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

type Props = {
  children: ReactNode;
};

/**
 * Always keeps the Expo Router subtree mounted (prevents hydration remount cycles).
 * Splash is an overlay only — never unmounts children.
 */
function BootstrapShellOverlay({ children }: Props) {
  const { phase } = useBootstrap();
  const showOverlay = !isBootstrapInteractive(phase);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      void clearDeliveryLocationCacheOnStartup();
    }
  }, []);

  useEffect(() => {
    if (!showOverlay) {
      logBoot('interactive', { phase });
    }
  }, [showOverlay, phase]);

  return (
    <View style={styles.root}>
      {children}
      {showOverlay ? (
        <View style={styles.overlay} pointerEvents="auto">
          <AppLogo size={112} marginTop={0} />
          <ActivityIndicator size="large" style={styles.spinner} />
        </View>
      ) : null}
    </View>
  );
}

export function BootstrapShell({ children }: Props) {
  useDevProviderMount('BootstrapShell');

  return (
    <BootstrapProvider>
      <BootstrapShellOverlay>{children}</BootstrapShellOverlay>
    </BootstrapProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    backgroundColor: '#0F172A',
    zIndex: 999,
  },
  spinner: { marginTop: 40 },
});
