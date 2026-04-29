import { useMenu } from '@/hooks/useMenu';
import { useAuth } from '@/services/AuthContext';
import { useCart } from '@/services/CartContext';
import { createOrder } from '@/services/orderService';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId: string }>();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';
  const { user } = useAuth();
  const { items: cart, clearCart } = useCart();
  const { items, loading } = useMenu(restaurantId || null);
  const [placing, setPlacing] = useState(false);

  const cartItems = useMemo(
    () =>
      cart
        .filter((item) => item.restaurantId === restaurantId)
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          qty: item.qty,
          image: item.image,
        })),
    [cart, restaurantId],
  );
  const totalPrice = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cartItems],
  );

  async function placeOrder() {
    if (!user?.uid) {
      showError('Please sign in first.');
      return;
    }
    if (!restaurantId || cartItems.length === 0 || items.length === 0) {
      showError('Cart is empty.');
      return;
    }
    setPlacing(true);
    try {
      const orderId = await createOrder({
        userId: user.uid,
        restaurantId,
        items: cartItems,
        totalPrice,
        deliveryLocation: {
          lat: 43.6532,
          lng: -79.3832,
          address: 'Toronto, ON',
        },
      });
      clearCart();
      showSuccess('Order placed successfully');
      router.replace(`/order/tracking/${orderId}` as never);
    } catch (error) {
      console.log('[cart] failed to place order', error);
      showError('Could not place order.');
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your Cart</Text>
        {cartItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubTitle}>Be the first to order</Text>
          </View>
        ) : (
          cartItems.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.name}>{item.qty}x {item.name}</Text>
              <Text style={styles.price}>${(item.price * item.qty).toFixed(2)}</Text>
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.total}>Total: ${totalPrice.toFixed(2)}</Text>
        <Pressable
          style={[styles.placeButton, (placing || cartItems.length === 0) && styles.disabled]}
          onPress={placeOrder}
          disabled={placing || cartItems.length === 0}
        >
          {placing ? <ActivityIndicator color="#fff" /> : <Text style={styles.placeText}>Place Order</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 120 },
  title: { color: '#0F172A', fontSize: 30, fontWeight: '800', marginBottom: 12 },
  emptyCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16 },
  emptyTitle: { color: '#64748B', fontWeight: '700' },
  emptySubTitle: { color: '#94A3B8', fontWeight: '600', marginTop: 4 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: { color: '#0F172A', fontWeight: '700' },
  price: { color: '#16A34A', fontWeight: '800' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  total: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
  placeButton: {
    marginLeft: 'auto',
    height: 42,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
