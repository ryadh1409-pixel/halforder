import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-svg';

import { BootstrapShell } from '@/components/BootstrapShell';
import { DevClientRequiredScreen } from '@/components/DevClientRequiredScreen';
import { RouteGroupMonitor } from '@/components/RouteGroupMonitor';
import { StartupRedirectOrchestrator } from '@/components/StartupRedirectOrchestrator';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { AppStripeProvider } from '@/services/stripe';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';

import { clearRoleRedirectGuards } from '@/lib/roleRouteGuard';
import { isOnAuthRoute, isRegisteredAuthUser } from '@/lib/authSession';
import { forceEnglishLayout } from '../lib/forceEnglishLayout';
import { logDevStartupConfig, useDevProviderMount } from '@/utils/devBootstrapDiagnostics';
import { logRedirect } from '@/utils/startupDiagnostics';
import { AuthProvider, useAuth } from '../services/AuthContext';
import { CartProvider } from '../services/CartContext';
import { configureExpoPushNotificationHandler } from '../services/pushNotifications';

forceEnglishLayout();
logDevStartupConfig();

if (!__DEV__) {
  LogBox.ignoreAllLogs(true);
}

if (Platform.OS !== 'web' && !isExpoGo) {
  configureExpoPushNotificationHandler();
}

function SignedOutRouteGuard() {
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const { user, authReady, loading } = useAuth();
  const hasRedirectedToLoginRef = useRef(false);

  useEffect(() => {
    if (isRegisteredAuthUser(user)) {
      hasRedirectedToLoginRef.current = false;
      return;
    }
    if (!authReady || loading) return;

    const segmentList = segments as string[];
    if (isOnAuthRoute(pathname, segmentList)) return;
    if (hasRedirectedToLoginRef.current) return;

    hasRedirectedToLoginRef.current = true;
    logRedirect('signed-out', {
      from: pathname,
      to: '/(auth)/login',
      reason: user?.isAnonymous ? 'anonymous-session' : 'signed-out',
    });
    router.replace('/(auth)/login' as never);
  }, [authReady, loading, pathname, router, segments, user]);

  return null;
}

export const unstable_settings = {
  initialRouteName: 'index',
};

export const linking = {
  prefixes: [
    'halforder://',
    'https://halforder.app',
    'https://www.halforder.app',
  ],
  config: {
    screens: {
      terms: 'terms',
      privacy: 'privacy',
      subscribe: 'subscribe',
      safety: 'safety',
      'safety-community-guidelines': 'safety-community-guidelines',
      'restaurant-dashboard': 'restaurant-dashboard',
      'restaurant-onboarding': 'restaurant-onboarding',
      checkout: 'checkout',
      order: 'order',
      'track-order/[orderId]': 'track-order/:orderId',
      'match/[orderId]': 'match/:orderId',
      'food-match/[matchId]': 'food-match/:matchId',
      'join/[orderId]': 'join/:orderId',
      'join/index': 'join',
      'chat/[id]': 'chat/:id',
    },
  },
};

export default function RootLayout() {
  useDevProviderMount('RootLayout');

  if (Platform.OS !== 'web' && isExpoGo) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <DevClientRequiredScreen />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppStripeProvider
        publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
        merchantIdentifier="merchant.com.halforder.app"
        urlScheme="halforder"
      >
        <ThemeProvider value={DarkTheme}>
          <View style={styles.ltrRoot}>
            <AuthProvider>
              <CartProvider>
                <BootstrapShell>
                  <Slot />
                  <SignedOutRouteGuard />
                  <StartupRedirectOrchestrator />
                  <RouteGroupMonitor />
                </BootstrapShell>
              </CartProvider>
            </AuthProvider>
          </View>
        </ThemeProvider>
      </AppStripeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  ltrRoot: {
    flex: 1,
    direction: 'ltr',
  },
});
