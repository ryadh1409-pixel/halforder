import AppHeader from '../../components/AppHeader';
import { DeliveryCard } from '../../components/driver/DeliveryCard';
import { formatOrderStatus, getNextDriverAction } from '../../components/driver/driverOrderUtils';
import * as Location from 'expo-location';
import { useDriverOrders } from '../../hooks/useDriverOrders';
import { useAuth } from '../../services/AuthContext';
import type { DriverOrder } from '../../services/driverService';
import { driverMarkOnTheWay, driverMarkPickedUp } from '../../services/driverService';
import { type OrderStatus, updateOrderDriverLocation, updateOrderStatus } from '../../services/orderService';
import { requireRole } from '../../utils/requireRole';
import { showError, showSuccess } from '../../utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverActiveScreen() {
  const { authorized, loading: roleLoading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const { orders, loading } = useDriverOrders(user?.uid);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, OrderStatus>>({});
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const displayOrders = useMemo(
    () =>
      orders.map((order) => ({
        ...order,
        status: optimisticStatus[order.id] ?? order.status,
      })),
    [optimisticStatus, orders],
  );

  useEffect(() => {
    const active = displayOrders.filter((o) => o.status === 'on_the_way');
    if (!user?.uid || active.length === 0) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    if (Platform.OS === 'web') return;
    console.log('[DRIVER FLOW] starting live location updates', active[0].id);
    void Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      tickRef.current = setInterval(() => {
        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((position) =>
            updateOrderDriverLocation(active[0].id, {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          )
          .catch(() => {});
      }, 5000);
    });
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [displayOrders, user?.uid]);

  async function runStatusUpdate(order: DriverOrder, nextStatus: OrderStatus, successText: string) {
    const finalState = order.status === 'delivered' || order.status === 'cancelled';
    if (finalState || updatingOrderId === order.id) return;
    setUpdatingOrderId(order.id);
    setOptimisticStatus((prev) => ({ ...prev, [order.id]: nextStatus }));
    try {
      if (nextStatus === 'picked_up') {
        await driverMarkPickedUp(order.id);
      } else if (nextStatus === 'on_the_way') {
        await driverMarkOnTheWay(order.id);
      } else {
        await updateOrderStatus(order.id, nextStatus);
      }
      showSuccess(successText);
      if (nextStatus === 'delivered') {
        setOptimisticStatus((prev) => {
          const copy = { ...prev };
          delete copy[order.id];
          return copy;
        });
      }
    } catch {
      setOptimisticStatus((prev) => {
        const copy = { ...prev };
        delete copy[order.id];
        return copy;
      });
      showError('Update failed');
    } finally {
      setUpdatingOrderId(null);
    }
  }

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Active" />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {displayOrders.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🚚</Text>
              <Text style={styles.emptyTitle}>No active deliveries</Text>
              <Text style={styles.emptySub}>Accept an order from the queue first.</Text>
              <Pressable style={styles.secondary} onPress={() => router.push('/(driver)/orders' as never)}>
                <Text style={styles.secondaryText}>Browse available</Text>
              </Pressable>
            </View>
          ) : (
            displayOrders.map((order) => {
              const nextAction = getNextDriverAction(order.status);
              return (
                <DeliveryCard
                  key={order.id}
                  order={order}
                  live={order.status === 'on_the_way'}
                  nextActionLabel={nextAction?.label ?? null}
                  actionLoading={updatingOrderId === order.id}
                  onCallCustomer={() => {
                    if (!order.customerPhone) return;
                    void Linking.openURL(`tel:${order.customerPhone}`);
                  }}
                  onPressAction={() => {
                    if (!nextAction) {
                      showError(`No next action for ${formatOrderStatus(order.status)}`);
                      return;
                    }
                    void runStatusUpdate(order, nextAction.nextStatus, nextAction.successText);
                  }}
                />
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#64748B' },
  list: { padding: 16, paddingBottom: 40 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { marginTop: 8, color: '#64748B', fontWeight: '600', textAlign: 'center' },
  secondary: {
    marginTop: 16,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
  },
  secondaryText: { color: '#334155', fontWeight: '800' },
});
