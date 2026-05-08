import AppHeader from '../../../components/AppHeader';
import { useAuth } from '../../../services/AuthContext';
import { acceptDelivery } from '../../../services/driverDispatch';
import {
  subscribeOrderById,
  updateOrderStatus,
  type RestaurantOrder,
} from '../../../services/orderService';
import { showError, showSuccess } from '../../../utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverOrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [order, setOrder] = useState<RestaurantOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [updatingStep, setUpdatingStep] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const unsub = subscribeOrderById(id, (next) => {
      setOrder(next);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  const stepAction = useMemo(() => {
    if (!order) return null;
    if (order.status === 'driver_accepted' || order.status === 'driver_assigned') {
      return { label: 'Arrived at restaurant', next: 'arriving_restaurant' as const };
    }
    if (order.status === 'arriving_restaurant') {
      return { label: 'Picked up', next: 'picked_up' as const };
    }
    if (order.status === 'picked_up') {
      return { label: 'Start delivering', next: 'on_the_way' as const };
    }
    if (order.status === 'on_the_way') {
      return { label: 'Delivered', next: 'delivered' as const };
    }
    return null;
  }, [order]);

  const mapDestination = order?.deliveryLocation;
  const mapRestaurant = order?.restaurantLocation;

  async function onAccept() {
    if (!order?.id || !user?.uid || accepting) return;
    setAccepting(true);
    try {
      await acceptDelivery(order.id, {
        id: user.uid,
        name: user.displayName?.trim() || 'Driver',
        phone: user.phoneNumber ?? null,
      });
      showSuccess('Order accepted');
      router.replace('/(driver)/active' as never);
    } catch {
      showError('Could not accept order');
    } finally {
      setAccepting(false);
    }
  }

  async function onAdvance() {
    if (!order?.id || !stepAction || updatingStep) return;
    setUpdatingStep(true);
    try {
      await updateOrderStatus(order.id, stepAction.next);
      showSuccess('Status updated');
      if (stepAction.next === 'delivered') {
        router.replace('/(driver)/active' as never);
      }
    } catch {
      showError('Could not update status');
    } finally {
      setUpdatingStep(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Order Details" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Order Details" />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Order Details" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.section}>Restaurant</Text>
          <Text style={styles.title}>{order.restaurantId}</Text>
          <Text style={styles.meta}>
            Location: {mapRestaurant ? `${mapRestaurant.lat.toFixed(4)}, ${mapRestaurant.lng.toFixed(4)}` : 'Unavailable'}
          </Text>
          <Pressable
            style={styles.chatBtn}
            onPress={() => showSuccess('Restaurant chat coming soon')}
          >
            <Text style={styles.chatBtnText}>Chat restaurant</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Customer</Text>
          <Text style={styles.title}>{order.customerName ?? 'Customer'}</Text>
          <Text style={styles.meta}>{order.deliveryLocation?.address ?? 'Address unavailable'}</Text>
          {order.customerPhone ? (
            <Pressable style={styles.chatBtn} onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}>
              <Text style={styles.chatBtnText}>Call customer</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Route Map</Text>
          <View style={styles.map}>
            <Text style={styles.pin}>📍 Restaurant</Text>
            <View style={styles.routeLine} />
            <Text style={styles.pin}>🏠 Customer</Text>
          </View>
          {mapDestination ? (
            <Pressable
              style={styles.navBtn}
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${mapDestination.lat},${mapDestination.lng}`,
                )
              }
            >
              <Text style={styles.navBtnText}>Open navigation</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Items</Text>
          {order.items.map((item) => (
            <Text key={`${item.id}-${item.name}`} style={styles.meta}>
              {item.qty}x {item.name}
            </Text>
          ))}
          <Text style={styles.meta}>Pickup instructions: {order.notes ?? 'No instructions'}</Text>
          <Text style={styles.meta}>
            ETA breakdown: Pickup {Math.max(5, Math.floor(order.estimatedDeliveryTime * 0.35))} min · Delivery{' '}
            {Math.max(5, Math.floor(order.estimatedDeliveryTime * 0.65))} min
          </Text>
        </View>

        {!order.driverId ? (
          <Pressable style={styles.acceptBtn} onPress={onAccept} disabled={accepting}>
            {accepting ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptBtnText}>Accept Order</Text>}
          </Pressable>
        ) : null}

        {stepAction ? (
          <Pressable style={styles.stepBtn} onPress={onAdvance} disabled={updatingStep}>
            {updatingStep ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptBtnText}>{stepAction.label}</Text>}
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#0F172A', fontWeight: '800', fontSize: 18 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  section: { color: '#64748B', fontWeight: '700', marginBottom: 6 },
  title: { color: '#0F172A', fontWeight: '800', fontSize: 17 },
  meta: { color: '#334155', fontWeight: '600', marginTop: 6 },
  chatBtn: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 10,
    alignItems: 'center',
  },
  chatBtnText: { color: '#334155', fontWeight: '700' },
  map: { marginTop: 8, borderRadius: 12, backgroundColor: '#F8FAFC', padding: 12 },
  pin: { color: '#0F172A', fontWeight: '700' },
  routeLine: { height: 22, width: 2, backgroundColor: '#94A3B8', marginLeft: 6, marginVertical: 4 },
  navBtn: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    alignItems: 'center',
  },
  navBtnText: { color: '#fff', fontWeight: '800' },
  acceptBtn: {
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginTop: 8,
  },
  stepBtn: {
    borderRadius: 12,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginTop: 10,
  },
  acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
