import AppHeader from '@/components/AppHeader';
import { useAuth } from '@/services/AuthContext';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import { getRestaurantOrderById } from '@/services/orderService';
import { isOwnerHost } from '@/services/roles';
import { resolveRestaurantPaymentsReady } from '@/services/stripeConnect';
import { openPaymentSheet } from '@/services/stripe';
import { showError, showSuccess } from '@/utils/toast';
import { doc, updateDoc } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Phase = 'loading' | 'paying' | 'error' | 'done';

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

      setPhase('paying');
      const result = await openPaymentSheet({
        amount: Math.round(order.totalPrice * 100),
        merchantDisplayName: 'HalfOrder',
        orderId: id,
      });

      if (result.status === 'canceled') {
        try {
          await updateDoc(doc(db, 'orders', id), {
            status: 'rejected',
            paymentStatus: 'failed',
          });
        } catch {
          // best-effort cleanup
        }
        setPhase('done');
        setMessage('Payment was canceled.');
        return;
      }
      if (result.status === 'failed') {
        setPhase('error');
        setMessage(result.message || 'Payment failed. Please try again.');
        showError('Payment failed.');
        return;
      }

      console.log('[checkout] marking order paid', {
        venueId: order.restaurantId,
        restaurantId: order.restaurantId,
        userId: user.uid,
        paymentStatus: 'paid',
      });

      await updateDoc(doc(db, 'orders', id), {
        paymentStatus: 'paid',
        stripePaymentIntentId: result.paymentIntentId,
        amount: Math.round(order.totalPrice * 100),
        status: 'pending_driver',
      });

      setPhase('done');
      showSuccess('Payment successful.');
      router.replace(`/order/tracking/${id}` as never);
    } catch (e) {
      console.warn('[checkout]', e);
      if (e instanceof Error && e.message === 'Please sign in to complete payment') {
        await auth.signOut();
        showError(e.message);
        router.replace('/(auth)/login');
        return;
      }
      setStripeBlockedRestaurantId(null);
      setPhase('error');
      setMessage('Could not start payment. You can try again.');
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
        {(phase === 'loading' || phase === 'paying') && (
          <>
            <ActivityIndicator size="large" color="#16A34A" />
            <Text style={styles.hint}>
              {phase === 'paying'
                ? 'Complete payment in the payment sheet…'
                : 'Preparing secure payment…'}
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
