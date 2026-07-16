import AppHeader from '@/components/AppHeader';
import { useAwaitOrderPaidNavigation } from '@/hooks/useAwaitOrderPaidNavigation';
import { logPaymentNavigation } from '@/lib/paymentNavigation';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PaymentSuccessScreen() {
  const params = useLocalSearchParams<{ orderId?: string; session_id?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId.trim() : '';

  useEffect(() => {
    logPaymentNavigation('payment_success_mount', {
      orderId,
      sessionId: typeof params.session_id === 'string' ? params.session_id : null,
    });
  }, [orderId, params.session_id]);

  const { timedOut, listening, navigateToLiveOrder } = useAwaitOrderPaidNavigation({
    orderId,
    enabled: Boolean(orderId),
  });

  const hint = useMemo(() => {
    if (timedOut) {
      return 'Confirmation is taking longer than expected. Open your order to see live updates.';
    }
    if (listening) {
      return 'Your Stripe payment was submitted. Confirming your order now…';
    }
    return 'Thank you! We are confirming your order.';
  }, [timedOut, listening]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Payment received" />
      <View style={styles.center}>
        {!timedOut ? <ActivityIndicator size="large" color="#22C55E" /> : null}
        <Text style={styles.title}>{timedOut ? 'Almost there' : 'Thank you!'}</Text>
        <Text style={styles.sub}>{hint}</Text>
        {orderId ? (
          <Pressable
            style={styles.button}
            onPress={() => {
              logPaymentNavigation('payment_success_manual_open', { orderId });
              navigateToLiveOrder(orderId, 'payment_success_manual');
            }}
          >
            <Text style={styles.buttonText}>
              {timedOut ? 'View order' : 'Open order'}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.sub}>Missing order id in return URL.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171923' },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginTop: 16 },
  sub: {
    marginTop: 12,
    color: '#7D8493',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 360,
  },
  button: {
    marginTop: 28,
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
