import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-svg';

import { AppLocationSync } from '@/components/AppLocationSync';
import { BootstrapShell } from '@/components/BootstrapShell';
import { HomeMarketplaceLocationProvider } from '@/contexts/HomeMarketplaceLocationContext';
import { DevClientRequiredScreen } from '@/components/DevClientRequiredScreen';
import { RoleBoundaryGuard } from '@/components/layout/RoleBoundaryGuard';
import { RouteGroupMonitor } from '@/components/RouteGroupMonitor';
import { StartupRedirectOrchestrator } from '@/components/StartupRedirectOrchestrator';
import { APPLE_PAY_MERCHANT_ID } from '@/constants/applePay';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { AppStripeProvider } from '@/services/stripe';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Slot } from 'expo-router';
import React from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
LogBox.ignoreLogs(['FirebaseError: Missing or insufficient permissions']);

import { forceEnglishLayout } from '../lib/forceEnglishLayout';
import { logDevStartupConfig, useDevProviderMount } from '@/utils/devBootstrapDiagnostics';
import { AuthProvider } from '../services/AuthContext';
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

// Guard against uncaught Promise rejections causing white screens.
if (typeof globalThis !== 'undefined') {
  const g = globalThis as typeof globalThis & {
    __HALFORDER_REJECTION_GUARD__?: boolean;
    addEventListener?: (
      type: string,
      listener: (event: { reason?: unknown }) => void,
    ) => void;
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (
        handler: (error: unknown, isFatal?: boolean) => void,
      ) => void;
    };
  };
  if (!g.__HALFORDER_REJECTION_GUARD__) {
    g.__HALFORDER_REJECTION_GUARD__ = true;
    if (typeof g.addEventListener === 'function') {
      g.addEventListener('unhandledrejection', (event) => {
        console.error('[UNHANDLED PROMISE]', event?.reason);
      });
    }
    const existing = g.ErrorUtils?.getGlobalHandler?.();
    if (typeof g.ErrorUtils?.setGlobalHandler === 'function') {
      g.ErrorUtils.setGlobalHandler((error, isFatal) => {
        console.error('[GLOBAL ERROR]', { error, isFatal });
        if (typeof existing === 'function') {
          existing(error, isFatal);
        }
      });
    }
  }
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
        merchantIdentifier={APPLE_PAY_MERCHANT_ID}
        urlScheme="halforder"
      >
        <ThemeProvider value={DarkTheme}>
          <View style={styles.ltrRoot}>
            <AuthProvider>
              <HomeMarketplaceLocationProvider>
                <AppLocationSync />
                <CartProvider>
                  <BootstrapShell>
                    <Slot />
                    <StartupRedirectOrchestrator />
                    <RoleBoundaryGuard />
                    <RouteGroupMonitor />
                  </BootstrapShell>
                </CartProvider>
              </HomeMarketplaceLocationProvider>
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
