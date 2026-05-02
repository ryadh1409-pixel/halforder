import { auth } from '../../services/firebase';
import {
  createSingleOrder,
  getRestaurantById,
  subscribeActiveMeals,
  subscribeMySingleOrders,
  type MarketplaceMeal,
  type MarketplaceSingleOrder,
} from '../../services/marketplaceMvp';
import { showError, showSuccess } from '../../utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RestaurantMap = Record<string, { name: string; location: string }>;

export default function RegularOrderScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creatingMealId, setCreatingMealId] = useState<string | null>(null);
  const [meals, setMeals] = useState<MarketplaceMeal[]>([]);
  const [myOrders, setMyOrders] = useState<MarketplaceSingleOrder[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantMap>({});

  const userId = auth.currentUser?.uid ?? null;

  useEffect(() => {
    const unsubMeals = subscribeActiveMeals((rows) => {
      setMeals(rows);
      setLoading(false);
    });
    return () => unsubMeals();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeMySingleOrders(userId, setMyOrders);
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    const ids = [...new Set(meals.map((m) => m.restaurantId).filter(Boolean))];
    if (ids.length === 0) return;
    let mounted = true;
    Promise.all(ids.map((id) => getRestaurantById(id))).then((rows) => {
      if (!mounted) return;
      const map: RestaurantMap = {};
      rows.forEach((r) => {
        if (!r) return;
        map[r.id] = { name: r.name, location: r.location };
      });
      setRestaurants(map);
    });
    return () => {
      mounted = false;
    };
  }, [meals]);

  const latestOpenOrder = useMemo(
    () => myOrders.find((o) => o.status !== 'completed') ?? null,
    [myOrders],
  );

  async function onPlaceOrder(meal: MarketplaceMeal) {
    if (!userId) {
      showError('Please sign in first.');
      return;
    }
    setCreatingMealId(meal.id);
    try {
      const orderId = await createSingleOrder({ meal, userId });
      showSuccess('Order created. Proceed to payment.');
      router.push(`/payment/${orderId}` as never);
    } catch {
      showError('Could not create order right now.');
    } finally {
      setCreatingMealId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Regular Order</Text>
        <Text style={styles.subtitle}>
          Instant food order (no matching needed), DoorDash-style flow.
        </Text>

        {latestOpenOrder ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeTitle}>Active order in progress</Text>
            <Text style={styles.activeMeta}>
              Status: {latestOpenOrder.status === 'matched' ? 'Matched / Dispatching' : latestOpenOrder.status}
            </Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.smallBtn, styles.primaryBtn]}
                onPress={() => router.push(`/payment/${latestOpenOrder.id}` as never)}
              >
                <Text style={styles.primaryBtnText}>Pay Now</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, styles.secondaryBtn]}
                onPress={() => router.push(`/delivery/${latestOpenOrder.id}` as never)}
              >
                <Text style={styles.secondaryBtnText}>Track Delivery</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {meals.map((meal) => {
          const rest = restaurants[meal.restaurantId];
          return (
            <View key={meal.id} style={styles.card}>
              <Text style={styles.mealName}>{meal.name}</Text>
              <Text style={styles.meta}>Regular price: ${meal.fullPrice.toFixed(2)}</Text>
              <Text style={styles.meta}>Shared price option: ${meal.sharedPrice.toFixed(2)}</Text>
              <Text style={styles.restaurant}>
                {rest?.name ?? 'Restaurant'} · {rest?.location ?? 'Toronto'}
              </Text>
              <Pressable
                style={styles.orderBtn}
                disabled={creatingMealId === meal.id}
                onPress={() => void onPlaceOrder(meal)}
              >
                <Text style={styles.orderBtnText}>
                  {creatingMealId === meal.id ? 'Creating...' : 'Order Now'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 24 },
  title: { fontSize: 30, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, marginBottom: 12, color: '#64748B', fontWeight: '600' },
  activeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    padding: 14,
    marginBottom: 12,
  },
  activeTitle: { color: '#1D4ED8', fontSize: 17, fontWeight: '800' },
  activeMeta: { marginTop: 6, color: '#1E40AF', fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallBtn: { flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { backgroundColor: '#2563EB' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800' },
  secondaryBtn: { borderWidth: 1, borderColor: '#93C5FD', backgroundColor: '#FFFFFF' },
  secondaryBtnText: { color: '#1D4ED8', fontWeight: '700' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  mealName: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  meta: { marginTop: 6, color: '#475569', fontWeight: '600' },
  restaurant: { marginTop: 8, color: '#64748B', fontSize: 12, fontWeight: '600' },
  orderBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
