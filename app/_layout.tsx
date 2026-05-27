import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-svg';

import { BootstrapShell } from '@/components/BootstrapShell';
import { DevClientRequiredScreen } from '@/components/DevClientRequiredScreen';
import { RoleBoundaryGuard } from '@/components/layout/RoleBoundaryGuard';
import { RouteGroupMonitor } from '@/components/RouteGroupMonitor';
import { StartupRedirectOrchestrator } from '@/components/StartupRedirectOrchestrator';
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
                  <StartupRedirectOrchestrator />
                  <RoleBoundaryGuard />
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
