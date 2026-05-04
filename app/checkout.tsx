import AppHeader from '@/components/AppHeader';
import { useAuth } from '@/services/AuthContext';
import { auth, ensureAuthReady } from '@/services/firebase';
import { getRestaurantOrderById } from '@/services/orderService';
import { isOwnerHost } from '@/services/roles';
import {
  createCheckoutSession,
  resolveRestaurantPaymentsReady,
} from '@/services/stripeConnect';
import { showError } from '@/utils/toast';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Phase = 'loading' | 'opening' | 'error' | 'done';

/** Root checkout — outside `(tabs)` so no tab chrome appears during payment. */
export default function CheckoutScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { user, role, loading: authLoading } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [stripeBlockedRestaurantId, setStripeBlockedRestaurantId] = useState<string | null>(null);
  const started = useRef(false);

  const runCheckout = useCallback(async () => {
    const id = typeof orderId === 'string' ? orderId.trim() : '';
    if (!id || !user?.uid) {
      setPhase('error');
      setMessage('Missing order or sign-in.');
      setStripeBlockedRestaurantId(null);
      return;
    }
    setPhase('loading');
    setMessage('');
    setStripeBlockedRestaurantId(null);
    try {
      await ensureAuthReady();
      if (!auth.currentUser) {
        setPhase('error');
        setMessage('Missing order or sign-in.');
        return;
      }
      const order = await getRestaurantOrderById(id);
      if (!order?.restaurantId) {
        setPhase('error');
        setMessage('Order not found.');
        return;
      }
      const ready = await resolveRestaurantPaymentsReady(order.restaurantId);
      if (!ready) {
        setStripeBlockedRestaurantId(order.restaurantId);
        const isOwnerOfOrderRestaurant =
          !authLoading && isOwnerHost(user, role, order.restaurantId);
        setPhase('error');
        setMessage(
          isOwnerOfOrderRestaurant
            ? 'Complete Stripe setup to receive payments'
            : 'Payments are temporarily unavailable for this restaurant',
        );
        return;
      }

      const successUrl = Linking.createURL('/order/payment-callback', {
        queryParams: { orderId: id, outcome: 'success' },
      });
      const cancelUrl = Linking.createURL('/order/payment-callback', {
        queryParams: { orderId: id, outcome: 'cancel' },
      });
      const { url } = await createCheckoutSession({
        orderId: id,
        successUrl,
        cancelUrl,
      });
      setPhase('opening');
      const returnUrl = Linking.createURL('/order/payment-callback');
      const browserResult = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      if (browserResult.type === 'success' && browserResult.url) {
        const parsed = Linking.parse(browserResult.url);
        const q = parsed.queryParams ?? {};
        const oid = Array.isArray(q.orderId) ? q.orderId[0] : q.orderId;
        const oc = Array.isArray(q.outcome) ? q.outcome[0] : q.outcome;
        router.replace({
          pathname: '/order/payment-callback',
          params: {
            orderId: typeof oid === 'string' ? oid : id,
            outcome: typeof oc === 'string' ? oc : 'success',
          },
        } as never);
        return;
      }
      setPhase('done');
      router.replace({
        pathname: '/order/payment-callback',
        params: { orderId: id, outcome: 'cancel' },
      } as never);
    } catch (e) {
      console.warn('[checkout]', e);
      setStripeBlockedRestaurantId(null);
      setPhase('error');
      setMessage('Could not start checkout. You can try again.');
      showError('Payment could not start.');
    }
  }, [orderId, user, role, authLoading, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runCheckout();
  }, [runCheckout]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Pay now" />
      <View style={styles.center}>
        {(phase === 'loading' || phase === 'opening') && (
          <>
            <ActivityIndicator size="large" color="#16A34A" />
            <Text style={styles.hint}>
              {phase === 'opening' ? 'Complete payment in the browser…' : 'Starting secure checkout…'}
            </Text>
          </>
        )}
        {phase === 'error' && (
          <>
            <Text style={styles.title}>Checkout unavailable</Text>
            <Text style={styles.sub}>{message}</Text>
            {stripeBlockedRestaurantId &&
            !authLoading &&
            isOwnerHost(user, role, stripeBlockedRestaurantId) ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push('/restaurant-onboarding')}
              >
                <Text style={styles.secondaryButtonText}>Complete Setup</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.button} onPress={() => void runCheckout()}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
            <Pressable style={styles.link} onPress={() => router.back()}>
              <Text style={styles.linkText}>Back</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  hint: { marginTop: 16, color: '#64748B', fontWeight: '600', textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  sub: { marginTop: 10, color: '#64748B', fontWeight: '600', textAlign: 'center' },
  button: {
    marginTop: 24,
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  secondaryButton: {
    marginTop: 16,
    backgroundColor: '#635BFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  secondaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  link: { marginTop: 16, padding: 8 },
  linkText: { color: '#2563EB', fontWeight: '700' },
});
