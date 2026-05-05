import { createPaymentIntent } from '@/services/stripe';
import { useAuth } from '@/services/auth/useAuth';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_AMOUNT_CENTS = 1200;

function hasPublishableKey(): boolean {
  return true;
}

export default function PaymentScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const amount = DEFAULT_AMOUNT_CENTS;
  const amountLabel = useMemo(() => `$${(amount / 100).toFixed(2)}`, [amount]);
  const showNativeKeyWarning = false;
  const payDisabled = loading;

  const handlePay = useCallback(async () => {
    console.log('[payment] handlePay tap, platform:', Platform.OS);

    if (!user?.uid) {
      Alert.alert('Sign in required', 'Sign in to complete payment.');
      return;
    }

    setLoading(true);
    try {
      const response = await createPaymentIntent(amount);
      const hasSecret =
        response &&
        typeof response === 'object' &&
        'clientSecret' in (response as Record<string, unknown>) &&
        typeof (response as { clientSecret?: unknown }).clientSecret === 'string';
      if (!hasSecret) {
        Alert.alert('Payment unavailable', 'Client SDK has been removed from this app build.');
        return;
      }
      Alert.alert('Payment intent created', 'Proceed from your backend-driven checkout flow.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed. Please try again.';
      console.error('[payment] caught error:', error);
      Alert.alert('Payment failed', message);
    } finally {
      setLoading(false);
    }
  }, [amount, user?.uid]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Pay with Stripe</Text>
        <Text style={styles.subtitle}>
          Server-driven payment flow
        </Text>
        {Platform.OS === 'web' && (
          <Text style={styles.warn}>Web payment flow is backend-controlled.</Text>
        )}
        {showNativeKeyWarning && (
          <Text style={styles.warn}>
            Stripe client SDK has been removed from this build.
          </Text>
        )}
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
