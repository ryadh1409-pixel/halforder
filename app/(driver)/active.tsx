import AppHeader from '../../components/AppHeader';
import { useDriverOrders } from '../../hooks/useDriverOrders';
import { useAuth } from '../../services/AuthContext';
import {
  driverMarkOnTheWay,
  driverMarkPickedUp,
} from '../../services/driverService';
import { updateOrderDriverLocation, updateOrderStatus } from '../../services/orderService';
import { requireRole } from '../../utils/requireRole';
import { showError, showSuccess } from '../../utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
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

export default function DriverActiveScreen() {
  const { authorized, loading: roleLoading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const { orders, loading } = useDriverOrders(user?.uid);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const active = orders.filter((o) => o.status === 'on_the_way');
    if (!user?.uid || active.length === 0) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    const base = { lat: 43.6532, lng: -79.3832 };
    let step = 0;
    tickRef.current = setInterval(() => {
      step += 1;
      const jitter = 0.0008 * Math.sin(step / 3);
      void updateOrderDriverLocation(active[0].id, {
        lat: base.lat + jitter,
        lng: base.lng + jitter * 0.7,
      }).catch(() => {});
    }, 4000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [orders, user?.uid]);

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
          {orders.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No active deliveries</Text>
              <Text style={styles.emptySub}>Accept an order from the queue first.</Text>
              <Pressable style={styles.secondary} onPress={() => router.push('/(driver)/orders' as never)}>
                <Text style={styles.secondaryText}>Browse available</Text>
              </Pressable>
            </View>
          ) : (
            orders.map((order) => (
              <View key={order.id} style={styles.card}>
                <Text style={styles.orderId}>#{order.id.slice(0, 10)}…</Text>
                <Text style={styles.badge}>{order.status.replace('_', ' ')}</Text>
                <Text style={styles.meta}>{order.restaurantName}</Text>
                <Text style={styles.meta}>{order.items.join(', ') || 'Items'}</Text>
                <Text style={styles.meta}>${order.total.toFixed(2)}</Text>
                {order.customerPhone ? (
                  <Pressable
                    style={styles.call}
                    onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
                  >
                    <Text style={styles.callText}>Call customer</Text>
                  </Pressable>
                ) : null}

                {order.status === 'ready' ? (
                  <Pressable
                    style={styles.primary}
                    onPress={() =>
                      driverMarkPickedUp(order.id)
                        .then(() => showSuccess('Picked up'))
                        .catch(() => showError('Update failed'))
                    }
                  >
                    <Text style={styles.primaryText}>Mark picked up</Text>
                  </Pressable>
                ) : null}

                {order.status === 'picked_up' ? (
                  <Pressable
                    style={styles.primary}
                    onPress={() =>
                      driverMarkOnTheWay(order.id)
                        .then(() => showSuccess('On the way'))
                        .catch(() => showError('Update failed'))
                    }
                  >
                    <Text style={styles.primaryText}>Start delivery</Text>
                  </Pressable>
                ) : null}

                {order.status === 'on_the_way' ? (
                  <Pressable
                    style={styles.primary}
                    onPress={() =>
                      updateOrderStatus(order.id, 'delivered')
                        .then(() => showSuccess('Delivered'))
                        .catch(() => showError('Update failed'))
                    }
                  >
                    <Text style={styles.primaryText}>Mark delivered</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
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
    alignItems: 'flex-start',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { marginTop: 8, color: '#64748B', fontWeight: '600' },
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
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 12,
  },
  orderId: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  badge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    fontWeight: '800',
    color: '#1D4ED8',
    textTransform: 'capitalize',
  },
  meta: { marginTop: 6, color: '#475569', fontWeight: '600' },
  call: { marginTop: 10 },
  callText: { color: '#2563EB', fontWeight: '800' },
  primary: {
    marginTop: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
});
