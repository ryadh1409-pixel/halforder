import { payOrderWithStripe } from '@/services/payment';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type OrderScreenProps = {
  orderId?: string;
  amount?: number;
};

export default function OrderScreen({
  orderId = 'mock-order-1',
  amount = 24.99,
}: OrderScreenProps) {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function handlePayAndConfirmOrder() {
    setLoading(true);
    setErrorText(null);
    try {
      await payOrderWithStripe({ amount, orderId });
    } catch {
      setErrorText('Payment failed, try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Order Checkout</Text>
        <Text style={styles.meta}>Order ID: {orderId}</Text>
        <Text style={styles.meta}>Amount: ${amount.toFixed(2)} CAD</Text>

        <Pressable
          style={[styles.payButton, loading && styles.payButtonDisabled]}
          onPress={() => void handlePayAndConfirmOrder()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.payButtonText}>Pay & Confirm Order</Text>
          )}
        </Pressable>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { color: '#0F172A', fontSize: 28, fontWeight: '800', marginBottom: 12 },
  meta: { color: '#64748B', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  payButton: {
    marginTop: 16,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonDisabled: { opacity: 0.65 },
  payButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  errorText: { marginTop: 12, color: '#DC2626', fontWeight: '700' },
});
