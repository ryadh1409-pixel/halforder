import { runPaymentSheetCheckout, useStripeWrapper } from '@/services/stripe';
import { showError, showSuccess } from '@/utils/toast';
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
  return Boolean(
    process.env.EXPO_PUBLIC_STRIPE_KEY?.trim() ||
      process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
}

export default function PaymentScreen() {
  const stripe = useStripeWrapper();
  const [loading, setLoading] = useState(false);
  const amount = DEFAULT_AMOUNT_CENTS;
  const amountLabel = useMemo(() => `$${(amount / 100).toFixed(2)}`, [amount]);
  const showNativeKeyWarning = Platform.OS !== 'web' && !hasPublishableKey();
  const payDisabled = loading || (Platform.OS !== 'web' && !hasPublishableKey());

  const handlePay = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Not available on web',
        'Stripe PaymentSheet runs in the iOS or Android app. Build with Expo Dev Client or EAS.',
      );
      return;
    }

    if (!hasPublishableKey()) {
      Alert.alert(
        'Stripe not configured',
        'Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to your .env and restart Expo.',
      );
      return;
    }

    setLoading(true);
    try {
      const outcome = await runPaymentSheetCheckout(amount, stripe);
      console.log('[payment] PaymentSheet outcome:', outcome);
      if (outcome === 'canceled') {
        return;
      }
      showSuccess('Payment successful');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed. Please try again.';
      console.error('[payment] failed', error);
      showError(message);
      Alert.alert('Payment failed', message);
    } finally {
      setLoading(false);
    }
  }, [amount, stripe]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Pay with Stripe</Text>
        <Text style={styles.subtitle}>
          Secure PaymentSheet · Test card 4242 4242 4242 4242
        </Text>
        {Platform.OS === 'web' && (
          <Text style={styles.warn}>
            PaymentSheet is not supported in the browser. Use the iOS or Android app.
          </Text>
        )}
        {showNativeKeyWarning && (
          <Text style={styles.warn}>
            Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (test pk_…) so the SDK can open checkout.
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
