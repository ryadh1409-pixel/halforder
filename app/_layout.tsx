import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SystemDialogHost } from '@/components/SystemDialogHost';
import { useAnalyticsSetup } from '@/hooks/layout/useAnalyticsSetup';
import { useAuthRedirect } from '@/hooks/layout/useAuthRedirect';
import { useNotificationSetup } from '@/hooks/layout/useNotificationSetup';
import { useOrderCleanup } from '@/hooks/layout/useOrderCleanup';
import { useTidioChat } from '@/hooks/layout/useTidioChat';
import { useSplitPokeListener } from '@/hooks/useSplitPokeListener';
import { useUserTermsStatus } from '@/hooks/useUserTermsStatus';
import { AuthProvider, useAuth } from '@/services/AuthContext';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useRef } from 'react';
import Toast from 'react-native-toast-message';
import { LogBox } from 'react-native';
import { toastConfig } from '@/utils/toast';
import 'react-native-reanimated';

LogBox.ignoreAllLogs(true);

function RootLayoutNav() {
  useSplitPokeListener();
  const { user, loading: authLoading, firestoreUserRole } = useAuth();
  const { ready: termsFirestoreReady, accepted: hasAcceptedTermsFs } =
    useUserTermsStatus(user?.uid);
  const currentUserRef = useRef(user);
  const latestOrderRef = useRef<{
    orderId: string | null;
    status: string;
    items: string;
  } | null>(null);
  const latestOrdersRef = useRef<
    { orderId: string; status: string; items: string; createdAt: string }[]
  >([]);
  const orderStateCacheRef = useRef<
    Record<string, { status: string; participants: number }>
  >({});
  const tidioOrderEventSentRef = useRef<Set<string>>(new Set());

  useTidioChat({
    user,
    currentUserRef,
    latestOrderRef,
    latestOrdersRef,
    orderStateCacheRef,
    tidioOrderEventSentRef,
  });
  useNotificationSetup(currentUserRef);
  useAuthRedirect({
    user,
    authLoading,
    firestoreUserRole,
    termsFirestoreReady,
    hasAcceptedTermsFs,
  });
  useOrderCleanup();
  useAnalyticsSetup(user);

  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="terms-acceptance"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="shared-order/[orderId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="match/[orderId]" options={{ headerShown: false }} />
        <Stack.Screen
          name="food-match/[matchId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="join/[orderId]" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="delivery/[orderId]"
          options={{ headerShown: false, title: 'Delivery Tracking' }}
        />
        <Stack.Screen
          name="driver/home"
          options={{ headerShown: false, title: 'Driver Home' }}
        />
        <Stack.Screen
          name="driver/incoming/[deliveryId]"
          options={{ headerShown: false, title: 'Incoming Order' }}
        />
        <Stack.Screen
          name="driver/active/[deliveryId]"
          options={{ headerShown: false, title: 'Active Delivery' }}
        />
        <Stack.Screen
          name="host/dashboard"
          options={{ headerShown: false, title: 'Host Dashboard' }}
        />
        <Stack.Screen
          name="halforder/home"
          options={{ headerShown: false, title: 'HalfOrder Home' }}
        />
        <Stack.Screen
          name="halforder/demo"
          options={{ headerShown: false, title: 'HalfOrder Demo' }}
        />
        <Stack.Screen
          name="halforder/analytics"
          options={{ headerShown: false, title: 'HalfOrder Analytics' }}
        />
        <Stack.Screen
          name="payment/[orderId]"
          options={{ headerShown: false, title: 'Checkout' }}
        />
        <Stack.Screen
          name="payment/receipt/[paymentId]"
          options={{ headerShown: false, title: 'Receipt' }}
        />
        <Stack.Screen name="help" options={{ headerShown: false }} />
        <Stack.Screen name="safety" options={{ headerShown: false }} />
        <Stack.Screen
          name="safety-community-guidelines"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="complaint" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  return (
    <ErrorBoundary>
      <StripeProvider
        publishableKey={publishableKey}
        merchantIdentifier="merchant.com.halforder.app"
      >
        <ThemeProvider value={DarkTheme}>
          <AuthProvider>
            <RootLayoutNav />
            <SystemDialogHost />
            <Toast config={toastConfig} />
          </AuthProvider>
        </ThemeProvider>
      </StripeProvider>
    </ErrorBoundary>
  );
}
