import { db } from '@/services/firebase';
import { openPaymentSheet } from '@/services/stripe';
import { useAuth } from '@/services/auth/useAuth';
import { showError, showSuccess } from '@/utils/toast';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_AMOUNT_CENTS = 1200;

export default function PaymentScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const amount = DEFAULT_AMOUNT_CENTS;
  const amountLabel = useMemo(() => `$${(amount / 100).toFixed(2)}`, [amount]);
  const payDisabled = loading;
  const trimmedOrderId = typeof orderId === 'string' ? orderId.trim() : '';

  const handlePay = useCallback(async () => {
    if (!user?.uid || user.isAnonymous) {
      Alert.alert('Sign in required', 'Sign in to complete payment.');
      router.replace('/(auth)/login');
      return;
    }

    setLoading(true);
    try {
      const result = await openPaymentSheet({
        amount,
        merchantDisplayName: 'HalfOrder',
        orderId: trimmedOrderId || undefined,
      });

      if (result.status === 'canceled') {
        Alert.alert('Payment canceled', 'No charge was made.');
        return;
      }

      if (result.status === 'failed') {
        showError(result.message || 'Payment failed. Please try again.');
        return;
      }

      if (trimmedOrderId) {
        await updateDoc(doc(db, 'orders', trimmedOrderId), {
          paymentStatus: 'paid',
          stripePaymentIntentId: result.paymentIntentId,
          amount,
          createdAt: serverTimestamp(),
          status: 'pending',
        });
      }

      showSuccess('Payment successful.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed. Please try again.';
      console.error('[payment] caught error:', error);
      if (message === 'Please sign in to complete payment') {
        router.replace('/(auth)/login');
      }
      Alert.alert('Payment failed', message);
    } finally {
      setLoading(false);
    }
  }, [amount, router, user?.isAnonymous, user?.uid]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Pay with Stripe</Text>
        <Text style={styles.subtitle}>
          Secure native checkout
        </Text>
        <View style={styles.buttonWrap}>
          <Pressable
            style={[styles.payButton, payDisabled ? styles.payButtonDisabled : null]}
            disabled={payDisabled}
            onPress={() => void handlePay()}
            accessibilityRole="button"
            accessibilityState={{ disabled: payDisabled }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payText}>Pay Now · {amountLabel}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#64748B',
    marginTop: 10,
    marginBottom: 28,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  warn: {
    color: '#B45309',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  buttonWrap: {
    alignItems: 'center',
  },
  payButton: {
    minWidth: 260,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  payButtonDisabled: {
    opacity: 0.55,
  },
  payText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
