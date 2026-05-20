import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-svg';

import { DevClientRequiredScreen } from '@/components/DevClientRequiredScreen';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { AppStripeProvider } from '@/services/stripe';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';

import {
  getRouteForRole,
  logAuthRoleDetected,
  logAuthRoleRouted,
  normalizeRoleForRouting,
} from '@/lib/authRole';
import { forceEnglishLayout } from '../lib/forceEnglishLayout';
import { AuthProvider, useAuth } from '../services/AuthContext';
import { CartProvider } from '../services/CartContext';
import { configureExpoPushNotificationHandler } from '../services/pushNotifications';

forceEnglishLayout();

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

/** Sole role-based `router.replace`: root `/` landing by role (see `app/index.tsx` for onboarding / terms). */
function RoleRouteGuard() {
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const { loading: authLoading, firestoreUserRole: role, user } = useAuth();

  useEffect(() => {
    if (authLoading || !role || pathname !== '/') return;
    if (!user) return;
    // `usePathname()` can be `/` for tab screens in some Expo Router builds; never role-redirect from inside these shells.
    const root = segments[0];
    if (
      root === '(tabs)' ||
      root === '(driver)' ||
      root === '(auth)' ||
      root === '(customer)' ||
      root === '(restaurant)'
    ) {
      return;
    }

    const normalized = normalizeRoleForRouting(role);
    logAuthRoleDetected(normalized);
    const route = getRouteForRole(normalized);
    logAuthRoleRouted(normalized, route);
    router.replace(route as never);
  }, [authLoading, role, pathname, router, user, segments]);

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
 * Root: providers + `<Slot />` — `RoleRouteGuard` is the only role-based navigation.
 *
 * `CartProvider` wraps `Slot` so `useCart()` works on stack routes; it is not navigation logic.
 */
export default function RootLayout() {
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
                <RoleRouteGuard />
                <Slot />
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
