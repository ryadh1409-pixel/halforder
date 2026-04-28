import { auth } from '@/services/firebase';
import { useRouter } from 'expo-router';
import { isDemoModeEnabled } from '@/services/halforderDemoMode';
import {
  getRestaurantById,
  joinOrder,
  matchOrder,
  subscribeActiveMeals,
  subscribeOpenOrders,
  type MarketplaceMeal,
  type MarketplaceOrder,
} from '@/services/marketplaceMvp';
import { calculatePaymentBreakdown } from '@/services/paymentSimulation';
import { runDemoSimulationTick, seedDemoDataIfNeeded } from '@/services/halforderSimulation';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RestaurantMap = Record<string, { name: string; location: string; isOpen: boolean }>;

export default function HalfOrderUserHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [meals, setMeals] = useState<MarketplaceMeal[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantMap>({});
  const [joiningMealId, setJoiningMealId] = useState<string | null>(null);
  const [checkoutOrderId, setCheckoutOrderId] = useState<string | null>(null);
  const [celebrationOrderId, setCelebrationOrderId] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const pulse = useState(() => new Animated.Value(0.7))[0];

  useEffect(() => {
    const unsubMeals = subscribeActiveMeals((rows) => {
      setMeals(rows);
      setLoading(false);
    });
    const unsubOrders = subscribeOpenOrders(setOrders);
    return () => {
      unsubMeals();
      unsubOrders();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void isDemoModeEnabled().then((enabled) => {
      if (!mounted) return;
      setDemoMode(enabled);
      if (enabled) {
        void seedDemoDataIfNeeded().catch(() => {});
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    const interval = setInterval(() => {
      void runDemoSimulationTick().catch(() => {});
    }, 9000);
    return () => clearInterval(interval);
  }, [demoMode]);

  useEffect(() => {
    const ids = [...new Set(meals.map((m) => m.restaurantId).filter(Boolean))];
    if (ids.length === 0) return;
    let mounted = true;
    Promise.all(ids.map((id) => getRestaurantById(id))).then((rows) => {
      if (!mounted) return;
      const map: RestaurantMap = {};
      rows.forEach((r) => {
        if (!r) return;
        map[r.id] = { name: r.name, location: r.location, isOpen: r.isOpen };
      });
      setRestaurants(map);
    });
    return () => {
      mounted = false;
    };
  }, [meals]);

  useEffect(() => {
    const matched = orders.find((order) => order.status === 'matched');
    if (!matched || celebrationOrderId === matched.id) return;
    setCelebrationOrderId(matched.id);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.7, duration: 240, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
    showSuccess('Matched 🎉 Your shared meal is locked in.');
  }, [celebrationOrderId, orders, pulse]);

  const bestOpenOrdersByMeal = useMemo(() => {
    const map = new Map<string, MarketplaceOrder>();
    for (const order of orders) {
      if (!order.mealId) continue;
      if (!map.has(order.mealId)) map.set(order.mealId, order);
    }
    return map;
  }, [orders]);

  async function handleJoin(meal: MarketplaceMeal) {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      showError('Please sign in to join a shared order.');
      return;
    }
    setJoiningMealId(meal.id);
    try {
      const orderId = await joinOrder({ meal, userId });
      showSuccess('Joined shared order');
      setCheckoutOrderId(orderId);
    } catch {
      showError('Could not join order. Please try again.');
    } finally {
      setJoiningMealId(null);
    }
  }

  async function handleManualMatch(orderId: string | undefined) {
    if (!orderId) return;
    try {
      await matchOrder(orderId);
      showSuccess('Order matched');
    } catch {
      showError('Could not match order.');
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>HalfOrder Home</Text>
        <Text style={styles.subtitle}>Browse meals and join nearby shared orders.</Text>

        {checkoutOrderId ? (
          <View style={styles.checkoutCard}>
            <Text style={styles.checkoutTitle}>Secure Checkout</Text>
            <Text style={styles.checkoutMeta}>Order ID: {checkoutOrderId}</Text>
            {(() => {
              const sourceOrder = orders.find((order) => order.id === checkoutOrderId);
              const meal = meals.find((m) => m.id === sourceOrder?.mealId);
              const pricing = calculatePaymentBreakdown(meal?.sharedPrice ?? 0);
              return (
                <>
                  <Text style={styles.checkoutMeta}>Shared price: ${pricing.subtotalPerUser.toFixed(2)}</Text>
                  <Text style={styles.checkoutMeta}>Platform fee (7%): ${pricing.platformFee.toFixed(2)}</Text>
                  <Text style={styles.checkoutMeta}>Total per user: ${pricing.totalPerUser.toFixed(2)}</Text>
                </>
              );
            })()}
            <Pressable
              style={styles.checkoutButton}
              onPress={() => router.push(`/payment/${checkoutOrderId}` as never)}
            >
              <Text style={styles.checkoutButtonText}>Pay Securely</Text>
            </Pressable>
          </View>
        ) : null}

        {meals.map((meal) => {
          const order = bestOpenOrdersByMeal.get(meal.id);
          const usersCount = order?.usersCount ?? 0;
          const status = order?.status ?? 'waiting';
          const restaurant = restaurants[meal.restaurantId];
          return (
            <View key={meal.id} style={styles.card}>
              <Text style={styles.mealName}>{meal.name}</Text>
              <Text style={styles.meta}>Shared price: ${meal.sharedPrice.toFixed(2)}</Text>
              <Text style={styles.meta}>Full price: ${meal.fullPrice.toFixed(2)}</Text>
              <Text style={styles.meta}>Users joined: {usersCount}/{meal.threshold}</Text>
              <Text style={[styles.meta, status === 'matched' && styles.matchedText]}>
                Status: {status === 'matched' ? 'Matched' : 'Waiting'}
              </Text>
              {status === 'matched' ? (
                <Animated.View style={[styles.matchedBanner, { transform: [{ scale: pulse }] }]}>
                  <Text style={styles.matchedBannerText}>Matched 🎉 Restaurant and driver are being notified</Text>
                </Animated.View>
              ) : null}
              <Text style={styles.restaurantLine}>
                {restaurant?.name ?? 'Restaurant'} · {restaurant?.location ?? 'Toronto'} ·{' '}
                {restaurant?.isOpen === false ? 'Closed' : 'Open'}
              </Text>
              <Pressable
                style={styles.joinButton}
                disabled={joiningMealId === meal.id}
                onPress={() => void handleJoin(meal)}
              >
                <Text style={styles.joinButtonText}>
                  {joiningMealId === meal.id ? 'Joining...' : 'Join Order'}
                </Text>
              </Pressable>
              {demoMode && status === 'waiting' && order?.id ? (
                <Pressable style={styles.matchNowButton} onPress={() => void handleManualMatch(order.id)}>
                  <Text style={styles.matchNowButtonText}>Force Match (Demo)</Text>
                </Pressable>
              ) : null}
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
  content: { padding: 16, paddingBottom: 30 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 6, color: '#64748B', fontSize: 14, marginBottom: 10 },
  checkoutCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  checkoutTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' },
  checkoutMeta: { marginTop: 6, color: '#64748B', fontSize: 12 },
  checkoutButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonText: { color: '#FFFFFF', fontWeight: '700' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  mealName: { color: '#0F172A', fontSize: 20, fontWeight: '800' },
  meta: { marginTop: 6, color: '#475569', fontSize: 14, fontWeight: '600' },
  matchedText: { color: '#16A34A', fontWeight: '800' },
  matchedBanner: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  matchedBannerText: { color: '#166534', fontSize: 12, fontWeight: '800' },
  restaurantLine: { marginTop: 8, color: '#64748B', fontSize: 12, fontWeight: '600' },
  joinButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
  },
  joinButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  matchNowButton: {
    marginTop: 8,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#94A3B8',
    backgroundColor: '#F8FAFC',
  },
  matchNowButtonText: { color: '#334155', fontSize: 13, fontWeight: '700' },
});
