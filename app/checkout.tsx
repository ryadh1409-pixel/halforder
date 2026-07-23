import AppHeader from '@/components/AppHeader';
import {
  useAwaitOrderPaidNavigation,
} from '@/hooks/useAwaitOrderPaidNavigation';
import { logPaymentNavigation } from '@/lib/paymentNavigation';
import { useAuth } from '@/services/AuthContext';
import { auth, ensureAuthReady } from '@/services/firebase';
import { getRestaurantOrderById } from '@/services/orderService';
import { openPaymentSheet } from '@/services/stripe';
import { getUserFriendlyError, showUserError } from '@/services/errors';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Phase = 'loading' | 'paying' | 'confirming' | 'error' | 'done';

/** Root checkout — outside `(tabs)` so no tab chrome appears during payment. */
export default function CheckoutScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const orderIdTrimmed = typeof orderId === 'string' ? orderId.trim() : '';
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  const awaitingPaid = phase === 'confirming';
  const { timedOut, listening, navigateToLiveOrder } = useAwaitOrderPaidNavigation({
    orderId: orderIdTrimmed,
    enabled: awaitingPaid,
  });

  const runCheckout = useCallback(async () => {
    const id = orderIdTrimmed;
    if (!id || !user?.uid) {
      setPhase('error');
      setMessage('Missing order or sign-in.');
      return;
    }
    setPhase('loading');
    setMessage('');
    try {
      await ensureAuthReady();
      if (!auth.currentUser) {
        setPhase('error');
        setMessage('Missing order or sign-in.');
        return;
      }
      if (auth.currentUser.isAnonymous) {
        await auth.signOut();
        showError('Please sign in to complete payment');
        router.replace('/(auth)/login');
        return;
      }
      const order = await getRestaurantOrderById(id);
      if (!order?.restaurantId) {
        setPhase('error');
        setMessage('Order not found.');
        return;
      }

      // Platform admin Stripe only — no restaurant Connect gate.
      setPhase('paying');
      const result = await openPaymentSheet({
        amount: Math.round(order.totalPrice * 100),
        merchantDisplayName: 'HalfOrder',
        orderId: id,
      });

      if (result.status === 'redirected') {
        setPhase('paying');
        setMessage('Redirecting to secure Stripe Checkout…');
        return;
      }

      if (result.status === 'canceled') {
        setPhase('done');
        setMessage('Payment was canceled. You can try again anytime.');
        return;
      }
      if (result.status === 'failed') {
        setPhase('error');
        setMessage(result.message || 'Payment failed. Please try again.');
        showError('Payment failed.');
        return;
      }

      console.log(
        JSON.stringify({
          msg: 'payment_flow_client_success',
          orderId: id,
          restaurantId: order.restaurantId,
          userId: user.uid,
          paymentIntentId: result.paymentIntentId,
        }),
      );

      logPaymentNavigation('checkout_payment_success', { orderId: id });
      setPhase('confirming');
      setMessage('Payment submitted. Confirming your order…');
      showSuccess('Payment submitted. Confirming your order…');
    } catch (e) {
      console.warn('[checkout]', e);
      if (e instanceof Error && e.message === 'Please sign in to complete payment') {
        await auth.signOut();
        showError(getUserFriendlyError(e));
        router.replace('/(auth)/login');
        return;
      }
      setPhase('error');
      setMessage('Could not start payment. You can try again.');
      showUserError(e, { context: 'payment' });
    }
  }, [orderIdTrimmed, user, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runCheckout();
  }, [runCheckout]);

  const confirmingHint = useMemo(() => {
    if (timedOut) {
      return 'This is taking longer than usual. You can open your order now — we will keep updating it live.';
    }
    if (listening) {
      return 'Waiting for payment confirmation…';
    }
    return 'Confirming your order…';
  }, [timedOut, listening]);

  const goToLiveOrder = useCallback(() => {
    if (!orderIdTrimmed) return;
    logPaymentNavigation('checkout_manual_view_order', { orderId: orderIdTrimmed });
    navigateToLiveOrder(orderIdTrimmed, 'checkout_manual_timeout');
  }, [orderIdTrimmed, navigateToLiveOrder]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Pay now" />
      <View style={styles.center}>
        {(phase === 'loading' || phase === 'paying') && (
          <>
            <ActivityIndicator size="large" color="#22C55E" />
            <Text style={styles.hint}>
              {phase === 'paying'
                ? message || 'Complete payment in the payment sheet…'
                : 'Preparing secure payment…'}
            </Text>
          </>
        )}
        {phase === 'confirming' && (
          <>
            <ActivityIndicator size="large" color="#22C55E" />
            <Text style={styles.title}>Confirming payment</Text>
            <Text style={styles.sub}>{confirmingHint}</Text>
            {timedOut && orderIdTrimmed ? (
              <Pressable style={styles.button} onPress={goToLiveOrder}>
                <Text style={styles.buttonText}>View order</Text>
              </Pressable>
            ) : null}
          </>
        )}
        {phase === 'error' && (
          <>
            <Text style={styles.title}>Checkout unavailable</Text>
            <Text style={styles.sub}>{message}</Text>
            <Pressable style={styles.button} onPress={() => void runCheckout()}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
            <Pressable style={styles.link} onPress={() => router.back()}>
              <Text style={styles.linkText}>Back</Text>
            </Pressable>
          </>
        )}
        {phase === 'done' && message ? (
          <>
            <Text style={styles.title}>Payment update</Text>
            <Text style={styles.sub}>{message}</Text>
            <Pressable style={styles.button} onPress={() => router.back()}>
              <Text style={styles.buttonText}>Back</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171923' },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  hint: { marginTop: 16, color: '#7D8493', fontWeight: '600', textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  sub: {
    marginTop: 10,
    color: '#7D8493',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  link: { marginTop: 16, padding: 8 },
  linkText: { color: '#2563EB', fontWeight: '700' },
});
