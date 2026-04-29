import { useMenu } from '@/hooks/useMenu';
import { useAuth } from '@/services/AuthContext';
import { useCart } from '@/services/CartContext';
import { showError } from '@/utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RestaurantMenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId: string }>();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';
  const { user } = useAuth();
  const { items, loading } = useMenu(restaurantId || null);
  const { items: cart, addToCart, removeFromCart } = useCart();

  const cartItems = useMemo(
    () => cart.filter((item) => item.restaurantId === restaurantId),
    [cart, restaurantId],
  );
  const totalPrice = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cartItems],
  );

  function openCart() {
    if (!user?.uid) {
      showError('Please sign in first.');
      return;
    }
    if (cartItems.length === 0) {
      showError('Cart is empty.');
      return;
    }
    router.push(`/restaurant-menu/cart?restaurantId=${encodeURIComponent(restaurantId)}` as never);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#16A34A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Restaurant Menu</Text>
        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No orders yet</Text>
            <Text style={styles.emptySubText}>Be the first to order</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.card}>
              {item.image ? <Image source={{ uri: item.image }} style={styles.image} /> : null}
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.price}>${item.price.toFixed(2)}</Text>
              <View style={styles.row}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => removeFromCart(item.id)}
                  disabled={!cart.find((row) => row.id === item.id && row.restaurantId === restaurantId)}
                >
                  <Text style={styles.qtyText}>-</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{cartItems.find((row) => row.id === item.id)?.qty ?? 0}</Text>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() =>
                    addToCart({
                      id: item.id,
                      name: item.name,
                      price: item.price,
                      image: item.image,
                      restaurantId,
                    })
                  }
                >
                  <Text style={styles.qtyText}>+</Text>
                </Pressable>
                <Pressable
                  style={styles.addBtn}
                  onPress={() =>
                    addToCart({
                      id: item.id,
                      name: item.name,
                      price: item.price,
                      image: item.image,
                      restaurantId,
                    })
                  }
                >
                  <Text style={styles.addText}>Add to Cart</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.cartBar}>
        <Text style={styles.cartText}>Total: ${totalPrice.toFixed(2)}</Text>
        <Pressable
          style={[styles.placeBtn, cartItems.length === 0 && styles.disabled]}
          onPress={openCart}
          disabled={cartItems.length === 0}
        >
          <Text style={styles.placeText}>View Cart</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 110 },
  title: { color: '#0F172A', fontSize: 30, fontWeight: '800', marginBottom: 10 },
  emptyCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16 },
  emptyText: { color: '#64748B', fontWeight: '600' },
  emptySubText: { color: '#94A3B8', fontWeight: '600', marginTop: 4 },
  card: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 12, marginBottom: 10 },
  image: { width: '100%', height: 160, borderRadius: 10, marginBottom: 8, backgroundColor: '#E2E8F0' },
  name: { color: '#0F172A', fontWeight: '800', fontSize: 17 },
  price: { color: '#16A34A', marginTop: 4, fontWeight: '800' },
  row: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#334155', fontWeight: '900', fontSize: 18 },
  qtyValue: { minWidth: 24, textAlign: 'center', color: '#0F172A', fontWeight: '700' },
  addBtn: { marginLeft: 'auto', height: 34, borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#FFFFFF', fontWeight: '700' },
  cartBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cartText: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
  placeBtn: { marginLeft: 'auto', height: 40, borderRadius: 10, paddingHorizontal: 16, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  placeText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
