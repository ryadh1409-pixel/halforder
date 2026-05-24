import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-svg';

import { AppBootstrapGate } from '@/components/AppBootstrapGate';
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

/** Production: suppress noisy redbox logs. Development: keep logs visible for debugging. */
if (!__DEV__) {
  LogBox.ignoreAllLogs(true);
}

/**
 * Push foreground handler uses native notification APIs — skip in Expo Go (unsupported /
 * different binary). Dev Client and standalone builds call this once at startup.
 */
if (Platform.OS !== 'web' && !isExpoGo) {
  configureExpoPushNotificationHandler();
}

/** After sign-out, leave protected shells and land on login once auth has settled. */
function SignedOutRouteGuard() {
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const { user, authReady, loading } = useAuth();
  const hasRedirectedToLoginRef = useRef(false);
  const pathnameRef = useRef(pathname);
  const segmentsRef = useRef(segments);
  pathnameRef.current = pathname;
  segmentsRef.current = segments;

  useEffect(() => {
    if (isRegisteredAuthUser(user)) {
      hasRedirectedToLoginRef.current = false;
      return;
    }
    if (!authReady || loading) return;

    const currentPath = pathnameRef.current;
    const segmentList = segmentsRef.current as string[];
    if (isOnAuthRoute(currentPath, segmentList)) return;

    if (hasRedirectedToLoginRef.current) return;
    hasRedirectedToLoginRef.current = true;

    logRedirect('signed-out', {
      from: currentPath,
      to: '/(auth)/login',
      reason: user?.isAnonymous ? 'anonymous-session' : 'signed-out',
    });
    router.replace('/(auth)/login' as never);
  }, [authReady, loading, router, user]);

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

/**
 * Root: providers + `<Slot />`.
 * `StartupRedirectOrchestrator` owns signed-in role landing (including `/` with empty segments).
 */
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
                <AppBootstrapGate>
                  <SignedOutRouteGuard />
                  <StartupRedirectOrchestrator />
                  <RouteGroupMonitor />
                  <Slot />
                </AppBootstrapGate>
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
