import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-svg';

import { DevClientRequiredScreen } from '@/components/DevClientRequiredScreen';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { AppStripeProvider } from '@/services/stripe';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { LogBox, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getRouteForRole,
  logAuthRoleDetected,
  logAuthRoleRouted,
  normalizeRoleForRouting,
} from '@/lib/authRole';
import {
  hasRoleShellLandingCompleted,
  isAlreadyOnRoleRoute,
  isAtAppEntryPoint,
  isInsideRoleShell,
  markRoleShellLandingComplete,
  resetRoleShellLanding,
  roleLandingKey,
} from '@/lib/roleRouteGuard';
import { forceEnglishLayout } from '../lib/forceEnglishLayout';
import { logAuthReady, logRouteRedirect } from '@/utils/routeDiagnostics';
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
  const hasRoutedRef = useRef(false);
  const routedKeyRef = useRef<string | null>(null);

  const segmentList = segments as string[];

  useEffect(() => {
    logAuthReady(!authLoading && Boolean(role), { uid: user?.uid ?? null });
  }, [authLoading, role, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      hasRoutedRef.current = false;
      routedKeyRef.current = null;
      resetRoleShellLanding();
      return;
    }
    if (authLoading || !role) return;

    if (hasRoleShellLandingCompleted()) {
      hasRoutedRef.current = true;
      return;
    }

    if (isInsideRoleShell(segmentList, pathname)) {
      hasRoutedRef.current = true;
      return;
    }

    if (hasRoutedRef.current) return;

    const normalized = normalizeRoleForRouting(role);
    if (isAlreadyOnRoleRoute(pathname, segmentList, normalized)) {
      markRoleShellLandingComplete();
      hasRoutedRef.current = true;
      return;
    }

    if (!isAtAppEntryPoint(pathname, segmentList)) return;

    const key = roleLandingKey(user.uid, role);
    if (routedKeyRef.current === key) return;

    const route = getRouteForRole(normalized);
    logAuthRoleDetected(normalized);
    logAuthRoleRouted(normalized, route);
    logRouteRedirect(pathname, route, { role: normalized, segments: segmentList });

    hasRoutedRef.current = true;
    routedKeyRef.current = key;
    markRoleShellLandingComplete();
    router.replace(route as never);
  }, [authLoading, role, pathname, router, user?.uid, segmentList]);

  return null;
}

function SessionQuickActions() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, firestoreUserRole, signOutUser, switchRoleMode } = useAuth();

  if (!user?.uid) return null;
  if (pathname.startsWith('/(auth)')) return null;

  const role = normalizeRoleForRouting(firestoreUserRole ?? 'user');

  return (
    <View style={styles.sessionFab}>
      <Text style={styles.sessionRole}>{role.toUpperCase()}</Text>
      <Pressable
        style={styles.sessionBtn}
        onPress={() => {
          void signOutUser();
          router.replace('/(auth)/login' as never);
        }}
      >
        <Text style={styles.sessionBtnTxt}>Logout</Text>
      </Pressable>
      {__DEV__ ? (
        <View style={styles.devRow}>
          <Pressable
            style={styles.devBtn}
            onPress={() => {
              void switchRoleMode('user').then(() => router.replace('/(tabs)' as never));
            }}
          >
            <Text style={styles.devTxt}>USER</Text>
          </Pressable>
          <Pressable
            style={styles.devBtn}
            onPress={() => {
              void switchRoleMode('driver').then(() => router.replace('/(driver)' as never));
            }}
          >
            <Text style={styles.devTxt}>DRIVER</Text>
          </Pressable>
          <Pressable
            style={styles.devBtn}
            onPress={() => {
              void switchRoleMode('restaurant').then(() => router.replace('/(host)' as never));
            }}
          >
            <Text style={styles.devTxt}>RESTAURANT</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
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
                <SessionQuickActions />
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
  sessionFab: {
    position: 'absolute',
    right: 14,
    top: 56,
    backgroundColor: 'rgba(17,24,39,0.92)',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 6,
  },
  sessionRole: { color: '#93C5FD', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  sessionBtn: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sessionBtnTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  devRow: { gap: 4 },
  devBtn: {
    backgroundColor: '#1F2937',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  devTxt: { color: '#D1D5DB', fontSize: 10, fontWeight: '800' },
});
