import {
  createRestaurantConnectedAccount,
  createRestaurantOnboardingLink,
  getCurrentHostId,
  refreshRestaurantConnectStatus,
  removeMeal,
  saveMeal,
  setMealActive,
  setRestaurantOpen,
  subscribeHostRestaurant,
  subscribeRestaurantMeals,
  subscribeRestaurantOrders,
  type HostMeal,
  type HostOrder,
  type HostRestaurant,
} from '@/services/hostDashboard';
import { showError, showSuccess } from '@/utils/toast';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ORDER_TARGET_USERS = 3;

function currency(v: number): string {
  return `$${v.toFixed(2)}`;
}

export default function HostDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<HostRestaurant | null>(null);
  const [meals, setMeals] = useState<HostMeal[]>([]);
  const [orders, setOrders] = useState<HostOrder[]>([]);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [fullPriceInput, setFullPriceInput] = useState('');
  const [sharedPriceInput, setSharedPriceInput] = useState('');
  const [thresholdInput, setThresholdInput] = useState('2');
  const [saving, setSaving] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);

  const hostId = getCurrentHostId();

  useEffect(() => {
    if (!hostId) {
      setLoading(false);
      return;
    }
    const unsubRestaurant = subscribeHostRestaurant(hostId, (r) => {
      setRestaurant(r);
      if (!r) {
        setMeals([]);
        setOrders([]);
        setLoading(false);
      }
    });
    return () => unsubRestaurant();
  }, [hostId]);

  useEffect(() => {
    if (!restaurant?.id) return;
    setLoading(true);
    const unsubMeals = subscribeRestaurantMeals(restaurant.id, (rows) => {
      setMeals(rows);
      setLoading(false);
    });
    const unsubOrders = subscribeRestaurantOrders(restaurant.id, setOrders);
    return () => {
      unsubMeals();
      unsubOrders();
    };
  }, [restaurant?.id]);

  const mealNameById = useMemo(() => {
    const map = new Map<string, HostMeal>();
    meals.forEach((m) => map.set(m.id, m));
    return map;
  }, [meals]);

  const analytics = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== 'completed').length;
    const soldToday = orders.filter((o) => o.status === 'completed').length;
    return { activeOrders, soldToday };
  }, [orders]);

  async function onSaveMeal() {
    if (!restaurant?.id) return;
    const fullPrice = Number(fullPriceInput);
    const sharedPrice = Number(sharedPriceInput);
    const threshold = Number(thresholdInput);
    if (
      !mealName.trim() ||
      !Number.isFinite(fullPrice) ||
      !Number.isFinite(sharedPrice) ||
      !Number.isFinite(threshold)
    ) {
      showError('Please complete all required fields.');
      return;
    }
    if (sharedPrice >= fullPrice) {
      showError('Shared price must be lower than full price.');
      return;
    }
    if (threshold < 2 || threshold > 3) {
      showError('Threshold must be 2 or 3 users.');
      return;
    }
    setSaving(true);
    try {
      await saveMeal({
        mealId: editingMealId,
        restaurantId: restaurant.id,
        name: mealName,
        fullPrice,
        sharedPrice,
        threshold,
      });
      showSuccess(editingMealId ? 'Meal updated' : 'Meal added');
      setEditingMealId(null);
      setMealName('');
      setFullPriceInput('');
      setSharedPriceInput('');
      setThresholdInput('2');
    } catch (e) {
      showError('Could not save meal. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function onEditMeal(meal: HostMeal) {
    setEditingMealId(meal.id);
    setMealName(meal.name);
    setFullPriceInput(String(meal.fullPrice));
    setSharedPriceInput(String(meal.sharedPrice));
    setThresholdInput(String(meal.threshold));
  }

  async function onConnectStripe() {
    if (!restaurant?.id) return;
    setConnectBusy(true);
    try {
      if (!restaurant.stripeAccountId) {
        await createRestaurantConnectedAccount(restaurant.id);
      }
      const url = await createRestaurantOnboardingLink(restaurant.id);
      await WebBrowser.openBrowserAsync(url);
      await refreshRestaurantConnectStatus(restaurant.id);
      showSuccess('Stripe onboarding opened');
    } catch {
      showError('Could not open Stripe onboarding.');
    } finally {
      setConnectBusy(false);
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
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.headerCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{restaurant?.name ?? 'Host Dashboard'}</Text>
                <Text style={styles.subtitle}>{restaurant?.location ?? 'Toronto'}</Text>
              </View>
              <View style={styles.openWrap}>
                <Text style={styles.openLabel}>{restaurant?.isOpen === false ? 'Closed' : 'Open'}</Text>
                <Switch
                  value={restaurant?.isOpen !== false}
                  onValueChange={(value) => {
                    if (!restaurant?.id) return;
                    void setRestaurantOpen(restaurant.id, value).catch(() => {
                      showError('Could not update restaurant status.');
                    });
                  }}
                />
              </View>
            </View>

            <View style={styles.analyticsRow}>
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsValue}>{analytics.soldToday}</Text>
                <Text style={styles.analyticsLabel}>Meals sold today</Text>
              </View>
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsValue}>{analytics.activeOrders}</Text>
                <Text style={styles.analyticsLabel}>Active orders</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Stripe Connect</Text>
              <Text style={styles.mealMeta}>
                Account:{' '}
                {restaurant?.stripeAccountId ? restaurant.stripeAccountId : 'Not connected'}
              </Text>
              <Text style={[styles.mealMeta, restaurant?.chargesEnabled ? styles.connectReady : styles.connectPending]}>
                Status: {restaurant?.chargesEnabled ? 'Payments enabled' : 'Onboarding required'}
              </Text>
              <Text style={[styles.mealMeta, restaurant?.payoutsEnabled ? styles.connectReady : styles.connectPending]}>
                Payouts: {restaurant?.payoutsEnabled ? 'Enabled' : 'Pending'}
              </Text>
              <Pressable
                style={styles.secondaryBtn}
                disabled={connectBusy}
                onPress={() => void onConnectStripe()}
              >
                <Text style={styles.secondaryBtnText}>
                  {connectBusy ? 'Opening...' : restaurant?.chargesEnabled ? 'Manage Stripe' : 'Connect Stripe'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{editingMealId ? 'Edit Meal' : 'Add Meal'}</Text>
              <TextInput
                style={styles.input}
                placeholder="Meal name"
                placeholderTextColor="#94A3B8"
                value={mealName}
                onChangeText={setMealName}
              />
              <TextInput
                style={styles.input}
                placeholder="Full price"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                value={fullPriceInput}
                onChangeText={setFullPriceInput}
              />
              <TextInput
                style={styles.input}
                placeholder="Shared price"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                value={sharedPriceInput}
                onChangeText={setSharedPriceInput}
              />
              <TextInput
                style={styles.input}
                placeholder="Threshold (2 or 3 users)"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                value={thresholdInput}
                onChangeText={setThresholdInput}
              />
              <Pressable style={styles.primaryBtn} disabled={saving} onPress={() => void onSaveMeal()}>
                <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Save Meal'}</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Meals</Text>
            {meals.map((meal) => (
              <View key={meal.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealName}>{meal.name}</Text>
                    <Text style={styles.mealMeta}>
                      Full {currency(meal.fullPrice)} · Shared {currency(meal.sharedPrice)} · Threshold {meal.threshold}
                    </Text>
                  </View>
                  <Switch value={meal.isActive} onValueChange={(v) => void setMealActive(meal.id, v)} />
                </View>
                <View style={styles.actionsRow}>
                  <Pressable style={styles.secondaryBtn} onPress={() => onEditMeal(meal)}>
                    <Text style={styles.secondaryBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={styles.dangerBtn}
                    onPress={() => {
                      void removeMeal(meal.id)
                        .then(() => showSuccess('Meal deleted'))
                        .catch(() => showError('Could not delete meal.'));
                    }}
                  >
                    <Text style={styles.dangerBtnText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Live Orders</Text>
          </>
        }
        renderItem={({ item }) => {
          const meal = mealNameById.get(item.mealId);
          const statusLabel = item.status === 'matched' ? 'Matched' : item.status === 'completed' ? 'Ready' : 'Waiting';
          const target = meal?.threshold ?? ORDER_TARGET_USERS;
          const progressWithTarget = `${item.usersCount}/${target}`;
          const matched = item.status === 'matched';
          const sharedPrice = meal?.sharedPrice ?? 0;
          const expectedRevenue = sharedPrice * item.usersCount;
          return (
            <View style={[styles.card, matched && styles.matchedCard]}>
              <Text style={styles.mealName}>{meal?.name ?? 'Meal'}</Text>
              <Text style={styles.mealMeta}>Users joined: {progressWithTarget}</Text>
              <Text style={[styles.status, matched && styles.matchedStatus]}>{statusLabel}</Text>
              <Text style={styles.revenue}>Expected revenue: {currency(expectedRevenue)}</Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No live orders yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 28 },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, color: '#64748B', fontSize: 14 },
  openWrap: { alignItems: 'center', gap: 6 },
  openLabel: { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  analyticsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  analyticsCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
  },
  analyticsValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  analyticsLabel: { marginTop: 4, color: '#64748B', fontSize: 12, fontWeight: '600' },
  card: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
  },
  matchedCard: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  cardTitle: { fontSize: 18, color: '#0F172A', fontWeight: '800', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 10,
    fontSize: 15,
    color: '#0F172A',
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  sectionTitle: { marginTop: 16, fontSize: 20, fontWeight: '800', color: '#0F172A' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealName: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  mealMeta: { marginTop: 6, fontSize: 14, color: '#64748B' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#334155', fontWeight: '700' },
  dangerBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { color: '#B91C1C', fontWeight: '700' },
  status: { marginTop: 8, color: '#0F172A', fontWeight: '700' },
  matchedStatus: { color: '#16A34A' },
  connectReady: { color: '#16A34A', fontWeight: '700' },
  connectPending: { color: '#B45309', fontWeight: '700' },
  revenue: { marginTop: 8, color: '#1E293B', fontWeight: '700' },
  empty: { marginTop: 12, color: '#64748B', textAlign: 'center' },
});
