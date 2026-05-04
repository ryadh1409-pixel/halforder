import {
  runPaymentSheetCheckout,
  STRIPE_MERCHANT_DISPLAY_NAME,
  STRIPE_PAYMENT_SHEET_RETURN_URL,
  useStripeWrapper,
} from '@/services/stripe';
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
  return Boolean(
    process.env.EXPO_PUBLIC_STRIPE_KEY?.trim() ||
      process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
}

export default function PaymentScreen() {
  const { user } = useAuth();
  const stripe = useStripeWrapper();
  const [loading, setLoading] = useState(false);
  const amount = DEFAULT_AMOUNT_CENTS;
  const amountLabel = useMemo(() => `$${(amount / 100).toFixed(2)}`, [amount]);
  const showNativeKeyWarning = Platform.OS !== 'web' && !hasPublishableKey();
  const payDisabled = loading || (Platform.OS !== 'web' && !hasPublishableKey());

  const handlePay = useCallback(async () => {
    console.log('[payment] handlePay tap, platform:', Platform.OS);

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

    if (!user?.uid) {
      Alert.alert('Sign in required', 'Sign in to complete payment.');
      return;
    }

    setLoading(true);
    try {
      console.log('[payment] fetching clientSecret…');
      const clientSecret = await runPaymentSheetCheckout({
        amountCents: amount,
        userId: user.uid,
        items: [],
      });
      console.log('[payment] clientSecret received, length:', clientSecret?.length ?? 0);

      if (!clientSecret) {
        console.error('[payment] No client secret');
        Alert.alert('Error', 'No client secret');
        return;
      }
      console.log('CLIENT SECRET:', clientSecret);

      console.log('[payment] initPaymentSheet…');
      const { error: initError } = await stripe.initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: STRIPE_MERCHANT_DISPLAY_NAME,
        returnURL: STRIPE_PAYMENT_SHEET_RETURN_URL,
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        console.log('[payment] INIT ERROR:', initError);
        Alert.alert('Init failed', initError.message ?? 'Unknown init error');
        return;
      }

      console.log('[payment] presentPaymentSheet…');
      const { error } = await stripe.presentPaymentSheet();

      if (error) {
        console.log('[payment] PAY ERROR:', error);
        Alert.alert('Payment failed', error.message ?? 'Unknown payment error');
      } else {
        console.log('[payment] presentPaymentSheet completed without error');
        Alert.alert('Success', 'Payment complete');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed. Please try again.';
      console.error('[payment] caught error:', error);
      Alert.alert('Payment failed', message);
    } finally {
      setLoading(false);
    }
  }, [amount, stripe, user?.uid]);

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
