import AppHeader from '../../components/AppHeader';
import { goHome } from '../../lib/navigation';
import { useAuth } from '../../services/AuthContext';
import { useCart } from '../../services/CartContext';
import { subscribeOrderById, type RestaurantOrder } from '../../services/orderService';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; outcome?: string }>();
  const { user } = useAuth();
  const { clearCartForRestaurant } = useCart();
  const [order, setOrder] = useState<RestaurantOrder | null | undefined>(undefined);
  const outcome = typeof params.outcome === 'string' ? params.outcome : '';
  const orderId = typeof params.orderId === 'string' ? params.orderId.trim() : '';

  const isOwner = useMemo(() => {
    if (!user?.uid || !order) return false;
    return order.userId === user.uid;
  }, [order, user?.uid]);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return;
    }
    const unsub = subscribeOrderById(orderId, (next) => {
      setOrder(next ?? null);
    });
    return () => unsub();
  }, [orderId]);

  useEffect(() => {
    if (!order || !isOwner) return;
    if (order.paymentStatus === 'paid' && order.restaurantId) {
      clearCartForRestaurant(order.restaurantId);
    }
  }, [order, isOwner, clearCartForRestaurant]);

  if (!orderId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Payment" />
        <View style={styles.center}>
          <Text style={styles.title}>Missing order</Text>
          <Pressable style={styles.button} onPress={goHome}>
            <Text style={styles.buttonText}>Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (order === undefined) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Payment" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16A34A" />
          <Text style={styles.hint}>Checking your order…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order || !isOwner) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Payment" />
        <View style={styles.center}>
          <Text style={styles.title}>Order not found</Text>
          <Text style={styles.sub}>Sign in as the customer who placed this order.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (outcome === 'cancel') {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Payment" />
        <View style={styles.center}>
          <Text style={styles.title}>Payment cancelled</Text>
          <Text style={styles.sub}>No charge was made. You can pay again when you are ready.</Text>
          <Pressable
            style={styles.button}
            onPress={() =>
              router.replace({
                pathname: '/checkout',
                params: { orderId },
              } as never)
            }
          >
            <Text style={styles.buttonText}>Pay now</Text>
          </Pressable>
          <Pressable
            style={styles.link}
            onPress={() =>
              router.replace(
                `/restaurant-menu/cart?restaurantId=${encodeURIComponent(order.restaurantId)}` as never,
              )
            }
          >
            <Text style={styles.linkText}>Back to cart</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (order.paymentStatus === 'paid' && order.status !== 'awaiting_payment') {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Payment" />
        <View style={styles.center}>
          <Text style={styles.title}>Payment successful</Text>
          <Text style={styles.sub}>Your order is with the restaurant.</Text>
          <Pressable
            style={styles.button}
            onPress={() => router.replace(`/order/tracking/${orderId}` as never)}
          >
            <Text style={styles.buttonText}>Track order</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Payment" />
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={styles.title}>Confirming payment…</Text>
        <Text style={styles.sub}>
          This usually takes a few seconds. If it takes longer, open tracking — your order updates
          when the payment clears.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => router.replace(`/order/tracking/${orderId}` as never)}
        >
          <Text style={styles.buttonText}>Open tracking</Text>
        </Pressable>
        <Pressable
          style={styles.link}
          onPress={() =>
            router.replace({
              pathname: '/checkout',
              params: { orderId },
            } as never)
          }
        >
          <Text style={styles.linkText}>Pay again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  hint: { marginTop: 16, color: '#64748B', fontWeight: '600' },
  title: { marginTop: 16, fontSize: 22, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  sub: { marginTop: 12, color: '#64748B', fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  button: {
    marginTop: 24,
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  link: { marginTop: 16, padding: 8 },
  linkText: { color: '#2563EB', fontWeight: '700' },
});
