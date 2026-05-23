import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-svg';

import { AppBootstrapGate } from '@/components/AppBootstrapGate';
import { DevClientRequiredScreen } from '@/components/DevClientRequiredScreen';
import { RouteGroupMonitor } from '@/components/RouteGroupMonitor';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { AppStripeProvider } from '@/services/stripe';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';

import {
  getRouteForRole,
  logAuthRoleDetected,
  logAuthRoleRouted,
  normalizeRoleForRouting,
} from '@/lib/authRole';
import {
  clearRoleRedirectGuards,
  completedRoleRedirects,
  hasRedirectCompleted,
  isAlreadyOnRoleRoute,
  isAtAppEntryPoint,
  markRedirectCompleted,
  roleLandingKey,
} from '@/lib/roleRouteGuard';
import { isDriverStackMounted } from '@/lib/driverStack';
import { isInDriverGroup } from '@/lib/driverRouteUtils';
import {
  isInsideCorrectRoleShell,
  isWrongGroupForRole,
} from '@/lib/routeGroups';
import { isOnAuthRoute, isRegisteredAuthUser } from '@/lib/authSession';
import { forceEnglishLayout } from '../lib/forceEnglishLayout';
import { logDevStartupConfig, useDevProviderMount } from '@/utils/devBootstrapDiagnostics';
import { logRedirectDecision } from '@/utils/driverLifecycleLog';
import { logAuthReady, logRouteRedirect } from '@/utils/routeDiagnostics';
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

    logRouteRedirect(currentPath, '/(auth)/login', {
      reason: user?.isAnonymous ? 'anonymous-session' : 'signed-out',
    });
    router.replace('/(auth)/login' as never);
  }, [authReady, loading, router, user]);

  return null;
}

/**
 * Sole role-based `router.replace` for signed-in entry from `/`.
 * Runs only after auth + role are resolved and only when outside the target role shell.
 */
function RoleRouteGuard() {
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const { authReady, roleResolved, firestoreUserRole: role, user } = useAuth();
  const prevUidRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  const segmentsRef = useRef(segments);
  pathnameRef.current = pathname;
  segmentsRef.current = segments;

  const isReady =
    authReady && roleResolved && isRegisteredAuthUser(user) && Boolean(role);

  useEffect(() => {
    logAuthReady(isReady, { uid: user?.uid ?? null, role: role ?? null });
  }, [isReady, role, user?.uid]);

  useEffect(() => {
    const uid = user?.uid ?? null;
    const prevUid = prevUidRef.current;
    prevUidRef.current = uid;

    if (!uid) {
      if (prevUid) {
        clearRoleRedirectGuards();
      }
      return;
    }

    if (!isReady || !role) return;

    const currentPathname = pathnameRef.current;
    const segmentList = segmentsRef.current as string[];
    const sessionKey = roleLandingKey(uid, role);
    if (completedRoleRedirects.has(sessionKey)) {
      logRedirectDecision({
        guard: 'RoleRouteGuard',
        action: 'skip',
        from: currentPathname,
        reason: 'session-already-redirected',
        role,
        segments: segmentList,
      });
      return;
    }

    const normalized = normalizeRoleForRouting(role);
    const targetRoute = getRouteForRole(normalized);

    if (isDriverStackMounted() && isInDriverGroup(segmentList, currentPathname)) {
      logRedirectDecision({
        guard: 'RoleRouteGuard',
        action: 'mark-complete',
        from: currentPathname,
        to: targetRoute,
        reason: 'driver-stack-latched',
        role: normalized,
        segments: segmentList,
      });
      markRedirectCompleted(targetRoute, sessionKey);
      return;
    }

    if (isInsideCorrectRoleShell(normalized, segmentList, currentPathname)) {
      logRedirectDecision({
        guard: 'RoleRouteGuard',
        action: 'mark-complete',
        from: currentPathname,
        to: targetRoute,
        reason: 'already-in-correct-role-group',
        role: normalized,
        segments: segmentList,
      });
      markRedirectCompleted(targetRoute, sessionKey);
      return;
    }

    if (isWrongGroupForRole(normalized, segmentList, currentPathname)) {
      const wrongGroupKey = `${sessionKey}:wrong-group`;
      if (!completedRoleRedirects.has(wrongGroupKey)) {
        completedRoleRedirects.add(wrongGroupKey);
        markRedirectCompleted(targetRoute, sessionKey);
        logRedirectDecision({
          guard: 'RoleRouteGuard',
          action: 'redirect',
          from: currentPathname,
          to: targetRoute,
          reason: 'wrong-route-group-recovery',
          role: normalized,
          segments: segmentList,
        });
        logAuthRoleDetected(normalized, user?.uid ?? '');
        logAuthRoleRouted(normalized, targetRoute, user?.uid ?? '');
        logRouteRedirect(currentPathname, targetRoute, {
          role: normalized,
          segments: segmentList,
          recovery: true,
        });
        router.replace(targetRoute as never);
      }
      return;
    }

    if (isAlreadyOnRoleRoute(currentPathname, segmentList, normalized)) {
      logRedirectDecision({
        guard: 'RoleRouteGuard',
        action: 'mark-complete',
        from: currentPathname,
        to: targetRoute,
        reason: 'already-on-role-route',
        role: normalized,
        segments: segmentList,
      });
      markRedirectCompleted(targetRoute, sessionKey);
      return;
    }

    if (!isAtAppEntryPoint(currentPathname, segmentList)) {
      logRedirectDecision({
        guard: 'RoleRouteGuard',
        action: 'skip',
        from: currentPathname,
        reason: 'not-app-entry-point',
        role: normalized,
        segments: segmentList,
      });
      return;
    }

    if (hasRedirectCompleted(targetRoute)) {
      completedRoleRedirects.add(sessionKey);
      logRedirectDecision({
        guard: 'RoleRouteGuard',
        action: 'skip',
        from: currentPathname,
        to: targetRoute,
        reason: 'target-route-already-completed',
        role: normalized,
        segments: segmentList,
      });
      return;
    }

    markRedirectCompleted(targetRoute, sessionKey);
    logRedirectDecision({
      guard: 'RoleRouteGuard',
      action: 'redirect',
      from: currentPathname,
      to: targetRoute,
      reason: 'entry-landing-by-role',
      role: normalized,
      segments: segmentList,
    });
    logAuthRoleDetected(normalized, uid);
    logAuthRoleRouted(normalized, targetRoute, uid);
    logRouteRedirect(currentPathname, targetRoute, { role: normalized, segments: segmentList });
    router.replace(targetRoute as never);
  }, [isReady, role, router, user?.uid]);

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
 * `AppBootstrapGate` latches appReady so Slot is not torn down on transient auth loading flicker.
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
                  <RoleRouteGuard />
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
