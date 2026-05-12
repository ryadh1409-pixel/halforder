import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { STRIPE_WEBHOOK_URL } from '@/frontend/config/stripeWebhook';
import { AppStripeProvider } from '@/services/stripe';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { LogBox } from 'react-native';

import { AuthProvider, useAuth } from '../services/AuthContext';
import { CartProvider } from '../services/CartContext';
import { configureExpoPushNotificationHandler } from '../services/pushNotifications';

LogBox.ignoreAllLogs(true);

configureExpoPushNotificationHandler();

function RootNavigationDebug() {
  const pathname = usePathname();
  const { firestoreUserRole, loading: authLoading } = useAuth();
  useEffect(() => {
    if (!__DEV__) return;
    console.log('[RootLayout]', {
      pathname,
      role: firestoreUserRole,
      authLoading,
    });
  }, [pathname, firestoreUserRole, authLoading]);
  return null;
}

/**
 * Role-based deep-link guard: must not call `router.replace` when the user is already
 * on a valid route for their role (e.g. drivers on `/order/[id]`), or Expo will re-render
 * in a tight loop ("Maximum update depth exceeded").
 */
function RoleRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { loading: authLoading, firestoreUserRole: role } = useAuth();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (authLoading || !role) return;

    if (role === 'driver' || role === 'admin') {
      const onAllowedDriverRoute =
        pathname.startsWith('/(driver)') ||
        pathname === '/home' ||
        pathname.startsWith('/order') ||
        pathname.startsWith('/track-order') ||
        pathname.startsWith('/(tabs)') ||
        pathname === '/' ||
        pathname.startsWith('/(auth)') ||
        pathname.startsWith('/onboarding') ||
        pathname.startsWith('/terms') ||
        pathname.startsWith('/join') ||
        pathname.startsWith('/checkout') ||
        pathname.startsWith('/map') ||
        pathname.startsWith('/restaurant-menu') ||
        pathname.startsWith('/match') ||
        pathname.startsWith('/food-match') ||
        pathname.startsWith('/chat') ||
        pathname.startsWith('/create-order') ||
        pathname.startsWith('/driver');

      if (onAllowedDriverRoute) {
        hasRedirected.current = false;
        return;
      }

      if (hasRedirected.current) return;
      hasRedirected.current = true;
      router.replace('/(driver)' as never);
      return;
    }

    hasRedirected.current = false;
  }, [authLoading, role, pathname, router]);

  return null;
}

console.log('🔥 STRIPE WEBHOOK URL:');
console.log(STRIPE_WEBHOOK_URL);

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
 * Root: providers + `<Slot />` — role guard runs in an effect with pathname / ref guards only
 * (avoids redirect loops on dynamic routes like `/order/[id]`).
 *
 * `CartProvider` wraps `Slot` so `useCart()` works on stack routes; it is not navigation logic.
 */
export default function RootLayout() {
  if (__DEV__) {
    console.log('[RootLayout] render');
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
              <RootNavigationDebug />
              <RoleRouteGuard />
              <Slot />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </AppStripeProvider>
    </GestureHandlerRootView>
  );
}
