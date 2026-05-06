import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { STRIPE_WEBHOOK_URL } from '@/frontend/config/stripeWebhook';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { Slot } from 'expo-router';
import React from 'react';
import { LogBox } from 'react-native';

import { AuthProvider } from '../services/AuthContext';
import { CartProvider } from '../services/CartContext';
import { configureExpoPushNotificationHandler } from '../services/pushNotifications';

LogBox.ignoreAllLogs(true);

configureExpoPushNotificationHandler();

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
      'match/[orderId]': 'match/:orderId',
      'food-match/[matchId]': 'food-match/:matchId',
      'join/[orderId]': 'join/:orderId',
      'join/index': 'join',
      'chat/[id]': 'chat/:id',
    },
  },
};

/**
 * Root: providers + `<Slot />` only — no navigation logic, `useEffect`, or `useRouter` here
 * (avoids redirect / listener loops). Group layouts (`(tabs)`, `(auth)`, `order`, …) own UI.
 *
 * `CartProvider` wraps `Slot` so `useCart()` works on stack routes; it is not navigation logic.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider
        publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
        merchantIdentifier="merchant.com.halforder.app"
        urlScheme="halforder"
      >
        <ThemeProvider value={DarkTheme}>
          <AuthProvider>
            <CartProvider>
              <Slot />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
