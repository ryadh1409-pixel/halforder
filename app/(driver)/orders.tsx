import AppHeader from '../../components/AppHeader';
import { useDriverOnlineStatus } from '../../hooks/useDriverOnlineStatus';
import { useAuth } from '../../services/AuthContext';
import {
  declineOrder,
  subscribeDriverQueue,
  type DeliveryQueueOrder,
} from '../../services/delivery';
import { acceptQueuedDeliveryOrder } from '../../services/driverService';
import { requireRole } from '../../utils/requireRole';
import { showError, showSuccess } from '../../utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverOrdersScreen() {
  const { authorized, loading: roleLoading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const { online, loading: onlineLoading } = useDriverOnlineStatus(user?.uid);
  const [orders, setOrders] = useState<DeliveryQueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [decliningOrderId, setDecliningOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeDriverQueue(user.uid, (rows) => {
      setOrders(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  const maskPhone = (phone: string | null) => {
    if (!phone) return 'Phone unavailable';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return 'Phone unavailable';
    return `***-***-${digits.slice(-4)}`;
  };

  const formatTime = (value: number | null) => {
    if (!value) return 'Just now';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  async function onAccept(orderId: string) {
    if (!user?.uid) return;
    const driver = {
      id: user.uid,
      name: user.displayName?.trim() || 'Driver',
      phone: user.phoneNumber ?? null,
      isOnline: true,
    };
    try {
      setAcceptingOrderId(orderId);
      const res = await acceptQueuedDeliveryOrder(orderId, driver);
      if (!res.ok) {
        showError(res.reason === 'already_assigned' ? 'Already assigned' : 'Could not accept order');
        return;
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      showSuccess('Order assigned to you');
      router.push(`/driver/active/${encodeURIComponent(orderId)}` as never);
    } catch {
      showError('Could not accept order.');
    } finally {
      setAcceptingOrderId(null);
    }
  }

  async function onDecline(orderId: string) {
    if (!user?.uid) return;
    try {
      setDecliningOrderId(orderId);
      await declineOrder(orderId, user.uid);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch {
      showError('Could not decline order.');
    } finally {
      setDecliningOrderId(null);
    }
  }

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER)),
    [orders],
  );

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Available" />
      {loading || onlineLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {!online ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>You are offline</Text>
              <Text style={styles.emptySub}>
                Go online in Driver Hub to receive dispatch requests.
              </Text>
            </View>
          ) : sortedOrders.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No pending orders</Text>
              <Text style={styles.emptySub}>
                New customer orders appear here in real time.
              </Text>
            </View>
          ) : (
            sortedOrders.map((order) => (
              <Pressable
                key={order.id}
                style={styles.card}
                onPress={() => router.push(`/(driver)/order/${encodeURIComponent(order.id)}` as never)}
              >
                <View style={styles.headerRow}>
                  <View style={styles.leftRow}>
                    {order.restaurantImage ? (
                      <Image source={{ uri: order.restaurantImage }} style={styles.logo} />
                    ) : (
                      <View style={[styles.logo, styles.logoFallback]}>
                        <Text style={styles.logoFallbackText}>R</Text>
                      </View>
                    )}
                    <View>
                      <Text style={styles.cardTitle}>{order.restaurantName}</Text>
                      <Text style={styles.meta}>📍 {order.distanceKm ?? '—'} km</Text>
                    </View>
                  </View>
                  <Text style={styles.payout}>${order.payout.toFixed(2)}</Text>
                </View>

                <Text style={styles.meta}>Customer: {order.customerName ?? 'Customer'}</Text>
                <Text style={styles.meta}>Phone: {maskPhone(order.customerPhone)}</Text>
                <Text style={styles.meta}>
                  Order time: {formatTime(order.createdAtMs)} · Pickup ETA: ~{order.estimatedDurationMin} min
                </Text>
                <Text style={styles.meta}>
                  Items ({order.itemCount}): {order.items.map((i) => i.name).join(', ')}
                </Text>
                <Text style={styles.meta}>Order age: {order.orderAgeMin} min</Text>
                <Text style={styles.meta}>📌 {order.deliveryAddress ?? 'Address unavailable'}</Text>
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.declineBtn, decliningOrderId === order.id && styles.primaryDisabled]}
                    disabled={decliningOrderId === order.id || acceptingOrderId === order.id}
                    onPress={() => onDecline(order.id)}
                  >
                    <Text style={styles.declineText}>
                      {decliningOrderId === order.id ? 'Declining...' : 'Decline'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primary, acceptingOrderId === order.id && styles.primaryDisabled]}
                    disabled={acceptingOrderId === order.id || decliningOrderId === order.id}
                    onPress={() => onAccept(order.id)}
                  >
                    <Text style={styles.primaryText}>
                      {acceptingOrderId === order.id ? 'Accepting...' : 'Accept'}
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            ))
          )}
          <Pressable style={styles.link} onPress={() => router.push('/(driver)/active' as never)}>
            <Text style={styles.linkText}>Go to active delivery →</Text>
          </Pressable>
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
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { marginTop: 8, color: '#64748B', fontWeight: '600' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  leftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logo: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#E2E8F0' },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { color: '#334155', fontWeight: '800' },
  payout: { color: '#16A34A', fontWeight: '900', fontSize: 20 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  meta: { marginTop: 6, color: '#475569', fontWeight: '600' },
  hint: { marginTop: 4, color: '#94A3B8', fontSize: 12 },
  primary: {
    marginTop: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  actionRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { color: '#64748B', fontWeight: '800', fontSize: 16 },
  link: { marginTop: 16, alignSelf: 'center' },
  linkText: { color: '#2563EB', fontWeight: '700' },
});
