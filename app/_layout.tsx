import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { DevClientRequiredScreen } from '@/components/DevClientRequiredScreen';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { AppStripeProvider } from '@/services/stripe';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { LogBox, Platform } from 'react-native';

import { AuthProvider, useAuth } from '../services/AuthContext';
import { CartProvider } from '../services/CartContext';
import { configureExpoPushNotificationHandler } from '../services/pushNotifications';

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

    if (role === 'driver') {
      router.replace('/home' as never);
      return;
    }
    if (role === 'admin') {
      router.replace('/admin' as never);
      return;
    }
    if (role === 'restaurant' || role === 'host') {
      router.replace('/(tabs)/host' as never);
      return;
    }
    if (role === 'user' || role === 'customer') {
      router.replace('/(tabs)' as never);
      return;
    }
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
          <AuthProvider>
            <CartProvider>
              <RoleRouteGuard />
              <Slot />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </AppStripeProvider>
    </GestureHandlerRootView>
  );
}
