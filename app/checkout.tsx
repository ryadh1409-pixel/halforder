import AppHeader from '@/components/AppHeader';
import {
  useAwaitOrderPaidNavigation,
} from '@/hooks/useAwaitOrderPaidNavigation';
import { logPaymentNavigation } from '@/lib/paymentNavigation';
import { useAuth } from '@/services/AuthContext';
import { auth, ensureAuthReady } from '@/services/firebase';
import { getRestaurantOrderById } from '@/services/orderService';
import { openPaymentSheet } from '@/services/stripe';
import { getUserFriendlyError } from '@/services/errors';
import { showError } from '@/utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Phase = 'loading' | 'paying' | 'confirming' | 'error';

/** Root checkout — outside `(tabs)` so no tab chrome appears during payment. */
export default function CheckoutScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const orderIdTrimmed = typeof orderId === 'string' ? orderId.trim() : '';
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);
  /** Blocks duplicate PaymentSheet / PaymentIntent from double taps. */
  const processingRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const awaitingPaid = phase === 'confirming';
  const { timedOut, listening, navigateToLiveOrder } = useAwaitOrderPaidNavigation({
    orderId: orderIdTrimmed,
    enabled: awaitingPaid,
  });

  const unlock = useCallback(() => {
    processingRef.current = false;
    setBusy(false);
  }, []);

  const runCheckout = useCallback(async () => {
    const id = orderIdTrimmed;
    if (!id || !user?.uid) {
      setPhase('error');
      setMessage('Missing order or sign-in.');
      return;
    }
    if (processingRef.current) return;
    processingRef.current = true;
    setBusy(true);

    setPhase('loading');
    setMessage('');
    try {
      await ensureAuthReady();
      if (!auth.currentUser) {
        setPhase('error');
        setMessage('Missing order or sign-in.');
        unlock();
        return;
      }
      if (auth.currentUser.isAnonymous) {
        await auth.signOut();
        showError('Please sign in to complete payment');
        unlock();
        router.replace('/(auth)/login');
        return;
      }
      const order = await getRestaurantOrderById(id);
      if (!order?.restaurantId) {
        setPhase('error');
        setMessage('Order not found.');
        unlock();
        return;
      }

      // Preparing → native PaymentSheet / Apple Pay (presented once).
      setPhase('paying');
      const result = await openPaymentSheet({
        amount: Math.round(order.totalPrice * 100),
        merchantDisplayName: 'HalfOrder',
        orderId: id,
      });

      if (result.status === 'redirected') {
        setPhase('paying');
        setMessage('Redirecting to secure Stripe Checkout…');
        // Keep locked while redirecting.
        return;
      }

      if (result.status === 'canceled') {
        logPaymentNavigation('checkout_payment_canceled', { orderId: id });
        unlock();
        router.back();
        return;
      }
      if (result.status === 'failed') {
        setPhase('error');
        setMessage(result.message || 'Payment failed. Please try again.');
        unlock();
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
      setMessage('Confirming your order…');
      // Remain locked until this screen is replaced after webhook navigation.

      // Redeem one-time Hi emooo after successful payment (idempotent if not available).
      try {
        const { redeemEmoHiEmoooDiscount } = await import(
          '@/services/emoAi/emoAiHiEmoooReward'
        );
        await redeemEmoHiEmoooDiscount(id);
      } catch {
        /* webhook also redeems; best-effort on client */
      }
    } catch (e) {
      console.warn('[checkout]', e);
      if (e instanceof Error && e.message === 'Please sign in to complete payment') {
        await auth.signOut();
        showError(getUserFriendlyError(e));
        unlock();
        router.replace('/(auth)/login');
        return;
      }
      setPhase('error');
      setMessage(
        getUserFriendlyError(e, { context: 'payment' }) ||
          'Could not start payment. You can try again.',
      );
      unlock();
    }
  }, [orderIdTrimmed, user, router, unlock]);

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

  const onRetry = useCallback(() => {
    if (processingRef.current || busy) return;
    void runCheckout();
  }, [runCheckout, busy]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Pay now" />
      <View style={styles.center}>
        {(phase === 'loading' || phase === 'paying') && (
          <>
            <ActivityIndicator size="large" color="#A855F7" />
            <Text style={styles.hint}>
              {phase === 'paying'
                ? message || 'Opening Stripe PaymentSheet…'
                : 'Preparing Stripe PaymentSheet…'}
            </Text>
          </>
        )}
        {phase === 'confirming' && (
          <>
            <ActivityIndicator size="large" color="#A855F7" />
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
            <Text style={styles.title}>Payment unsuccessful</Text>
            <Text style={styles.sub}>{message}</Text>
            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={onRetry}
              disabled={busy}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
            <Pressable style={styles.link} onPress={() => router.back()} disabled={busy}>
              <Text style={styles.linkText}>Back</Text>
            </Pressable>
          </>
        )}
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
    backgroundColor: '#A855F7',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  link: { marginTop: 16, padding: 8 },
  linkText: { color: '#A855F7', fontWeight: '700' },
});
