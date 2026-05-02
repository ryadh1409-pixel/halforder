import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getOrderById, markOrderPaid, useMockDeliveryOrders } from '../services/mockDeliveryStore';
import { payOrderWithStripe } from '../services/payment';

export default function ReviewOrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  useMockDeliveryOrders();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const order = useMemo(() => (id ? getOrderById(id) : null), [id]);
  const totalWithDelivery = (order?.totalPrice ?? 0) + (order?.deliveryFee ?? 0);

  async function handlePayAndPlaceOrder() {
    if (!order) return;
    setLoading(true);
    setErrorText(null);
    try {
      await payOrderWithStripe({
        orderId: order.id,
        amount: totalWithDelivery,
      });
      markOrderPaid(order.id);
      router.replace(`/order/tracking/${order.id}` as never);
    } catch {
      setErrorText('Payment failed, try again');
    } finally {
      setLoading(false);
    }
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.content}>
          <Text style={styles.title}>Review Order</Text>
          <Text style={styles.errorText}>Order not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Review Your Order</Text>
        <View style={styles.summaryCard}>
          <Text style={styles.row}>Item: {order.itemName}</Text>
          <Text style={styles.row}>Total price: ${order.totalPrice.toFixed(2)}</Text>
          <Text style={styles.row}>Delivery fee: ${order.deliveryFee.toFixed(2)}</Text>
          <Text style={styles.row}>Split savings: ${order.splitSavings.toFixed(2)}</Text>
          <Text style={styles.row}>Users: {order.usersCount}</Text>
          <Text style={styles.total}>Pay now: ${totalWithDelivery.toFixed(2)} CAD</Text>
        </View>

        <View style={styles.paymentCard}>
          <Text style={styles.paymentTitle}>Payment</Text>
          <Text style={styles.paymentText}>Secure checkout with Stripe</Text>
        </View>

        <Pressable
          style={[styles.ctaButton, loading && styles.ctaButtonDisabled]}
          disabled={loading}
          onPress={() => void handlePayAndPlaceOrder()}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaButtonText}>Pay & Place Order</Text>
          )}
        </Pressable>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1, padding: 16 },
  title: { color: '#0F172A', fontSize: 30, fontWeight: '800', marginBottom: 12 },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  row: { color: '#334155', fontWeight: '600', marginBottom: 6 },
  total: { color: '#0F172A', fontWeight: '800', marginTop: 4, fontSize: 16 },
  paymentCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  paymentTitle: { color: '#0F172A', fontWeight: '800', fontSize: 17 },
  paymentText: { color: '#64748B', fontWeight: '600', marginTop: 4 },
  ctaButton: {
    marginTop: 14,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: { opacity: 0.65 },
  ctaButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  errorText: { marginTop: 10, color: '#DC2626', fontWeight: '700' },
});
