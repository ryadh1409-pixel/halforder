import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../services/AuthContext';
import { acceptOrderWithLock } from '../../services/delivery';
import {
  driverMarkOnTheWay,
  driverMarkPickedUp,
  getDriverActiveOrders,
  subscribeAvailableOrders,
  updateDriverOnlineStatus,
  type DriverOrder,
} from '../../services/driverService';
import { showError, showSuccess } from '../../utils/toast';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function DriverHubScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [availableOrders, setAvailableOrders] = useState<DriverOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<DriverOrder[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [stats, setStats] = useState({ deliveries: 0, earnings: 0, rating: 5.0 });
  const unsubAvailable = useRef<(() => void) | null>(null);
  const unsubActive = useRef<(() => void) | null>(null);
  const unsubDriver = useRef<(() => void) | null>(null);

  // Subscribe to driver profile (online status + stats)
  useEffect(() => {
    if (!user?.uid) return;
    // Ensure driver document exists
    setDoc(
      doc(db, 'drivers', user.uid),
      { isOnline: false, name: user.displayName ?? 'Driver' },
      { merge: true }
    ).catch(() => {});

    const ref = doc(db, 'drivers', user.uid);
    unsubDriver.current = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setIsOnline(data.isOnline === true);
      setStats({
        deliveries: typeof data.totalDeliveries === 'number' ? data.totalDeliveries : 0,
        earnings: typeof data.totalEarnings === 'number' ? data.totalEarnings : 0,
        rating: typeof data.rating === 'number' ? data.rating : 5.0,
      });
    });
    return () => unsubDriver.current?.();
  }, [user?.uid]);

  // Subscribe to available + active orders when online
  useEffect(() => {
    if (!user?.uid) return;
    if (isOnline) {
      console.log('[DRIVER FLOW] going online, subscribing to orders');
      unsubAvailable.current = subscribeAvailableOrders((orders) => {
        setAvailableOrders(orders.filter((o) => !o.driverId));
      });
      unsubActive.current = getDriverActiveOrders(user.uid, setActiveOrders);
    } else {
      console.log('[DRIVER FLOW] going offline, clearing orders');
      unsubAvailable.current?.();
      unsubActive.current?.();
      setAvailableOrders([]);
      setActiveOrders([]);
    }
    return () => {
      unsubAvailable.current?.();
      unsubActive.current?.();
    };
  }, [isOnline, user?.uid]);

  const handleToggleOnline = useCallback(async () => {
    if (!user?.uid || togglingOnline) return;
    const newValue = !isOnline;
    setTogglingOnline(true);
    setIsOnline(newValue); // optimistic update
    try {
      await updateDriverOnlineStatus(user.uid, newValue);
    } catch {
      setIsOnline(!newValue); // revert on failure
      showError('Failed to update online status');
    } finally {
      setTogglingOnline(false);
    }
  }, [user?.uid, isOnline, togglingOnline]);

  const handleAccept = useCallback(async (order: DriverOrder) => {
    if (!user?.uid || acceptingId) return;
    setAcceptingId(order.id);
    try {
      const profile = { id: user.uid, name: user.displayName ?? 'Driver', phone: null, isOnline: true };
      await acceptOrderWithLock(order.id, profile);
      setAvailableOrders((prev) => prev.filter((candidate) => candidate.id !== order.id));
      showSuccess('Order accepted!');
      router.replace(`/driver/active/${encodeURIComponent(order.id)}` as never);
    } catch {
      showError('Failed to accept order');
    } finally {
      setAcceptingId(null);
    }
  }, [user?.uid, acceptingId]);

  const formatOrderTime = (value: number | null) => {
    if (!value) return 'Now';
    const date = new Date(value);
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return isToday ? `Today ${timeLabel}` : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const formatItemsSummary = (order: DriverOrder) =>
    order.items.map((item) => `${item.qty}x ${item.name}`).join(', ');

  const totalItemsCount = (order: DriverOrder) =>
    order.items.reduce((sum, item) => sum + (Number.isFinite(item.qty) ? item.qty : 0), 0);

  const handlePickedUp = useCallback(async (orderId: string) => {
    try {
      await driverMarkPickedUp(orderId);
      showSuccess('Marked as picked up!');
    } catch { showError('Failed to update'); }
  }, []);

  const handleOnTheWay = useCallback(async (orderId: string) => {
    try {
      await driverMarkOnTheWay(orderId);
      showSuccess('On the way!');
    } catch { showError('Failed to update'); }
  }, []);

  const handleDelivered = useCallback(async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'delivered', estimatedDeliveryTime: 0 });
      showSuccess('Delivered! 🎉');
    } catch { showError('Failed to update'); }
  }, []);

  const callPhone = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      driver_accepted: 'Head to Restaurant',
      arriving_restaurant: 'At Restaurant',
      picked_up: 'Heading to Customer',
      on_the_way: 'On The Way',
    };
    return map[status] ?? status;
  };

  const getNextAction = (order: DriverOrder) => {
    if (order.status === 'driver_accepted' || order.status === 'arriving_restaurant') {
      return { label: '📦 Picked Up', action: () => handlePickedUp(order.id), color: '#FF6B00' };
    }
    if (order.status === 'picked_up') {
      return { label: '🚗 On The Way', action: () => handleOnTheWay(order.id), color: '#2563EB' };
    }
    if (order.status === 'on_the_way') {
      return { label: '✅ Delivered', action: () => handleDelivered(order.id), color: '#16A34A' };
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Driver Hub</Text>
          <Text style={styles.headerSub}>{isOnline ? '🟢 You are online' : '⚫ You are offline'}</Text>
        </View>
        <View style={styles.onlineRow}>
          {togglingOnline && <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />}
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: '#374151', true: '#16A34A' }}
            thumbColor="#fff"
            disabled={togglingOnline}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.deliveries}</Text>
            <Text style={styles.statLabel}>Deliveries</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMid]}>
            <Text style={styles.statValue}>${stats.earnings.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>⭐ {stats.rating.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* ── Active Delivery ── */}
        {activeOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚗 Active Delivery</Text>
            {activeOrders.map((order) => {
              const nextAction = getNextAction(order);
              return (
                <View key={order.id} style={styles.activeCard}>
                  <View style={styles.activeCardHeader}>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>{getStatusLabel(order.status)}</Text>
                    </View>
                    <Text style={styles.activeEarning}>${order.total.toFixed(2)}</Text>
                  </View>

                  <Text style={styles.restaurantName}>🍽 {order.restaurantName}</Text>

                  <View style={styles.divider} />

                  <View style={styles.deliveryInfo}>
                    <Text style={styles.deliveryLabel}>Deliver to</Text>
                    <Text style={styles.deliveryAddress}>{order.deliveryAddress ?? 'Address unavailable'}</Text>
                  </View>

                  {order.customerPhone && (
                    <Pressable style={styles.callBtn} onPress={() => callPhone(order.customerPhone)}>
                      <Text style={styles.callBtnText}>📞 Call Customer</Text>
                    </Pressable>
                  )}

                  {nextAction && (
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: nextAction.color }]}
                      onPress={nextAction.action}
                    >
                      <Text style={styles.actionBtnText}>{nextAction.label}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Available Orders ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 Available Orders</Text>
            <Text style={styles.sectionCount}>{availableOrders.length} order{availableOrders.length !== 1 ? 's' : ''}</Text>
          </View>

          {!isOnline ? (
            <View style={styles.offlineCard}>
              <Text style={styles.offlineIcon}>⚫</Text>
              <Text style={styles.offlineTitle}>You are offline</Text>
              <Text style={styles.offlineSub}>Go online to see available orders</Text>
              <Pressable style={styles.goOnlineBtn} onPress={handleToggleOnline}>
                <Text style={styles.goOnlineBtnText}>Go Online</Text>
              </Pressable>
            </View>
          ) : availableOrders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>Looking for orders...</Text>
              <Text style={styles.emptySub}>New orders will appear here in real-time</Text>
              <ActivityIndicator color="#16A34A" style={{ marginTop: 12 }} />
            </View>
          ) : (
            availableOrders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderCardTop}>
                  <View style={styles.orderIdentityWrap}>
                    {order.restaurantImage ? (
                      <Image source={{ uri: order.restaurantImage }} style={styles.restaurantLogo} />
                    ) : (
                      <View style={[styles.restaurantLogo, styles.restaurantLogoFallback]}>
                        <Text style={styles.restaurantLogoFallbackText}>
                          {(order.restaurantName || 'R').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.orderCardLeft}>
                      <Text style={styles.orderRestaurant}>{order.restaurantName || 'Restaurant'}</Text>
                      <Text style={styles.orderTimestamp}>{formatOrderTime(order.createdAtMs)}</Text>
                    </View>
                  </View>
                  <View style={styles.orderEarningBadge}>
                    <Text style={styles.orderEarningText}>${(order.deliveryFee || order.total).toFixed(2)}</Text>
                    <Text style={styles.orderEarningCaption}>Earnings</Text>
                  </View>
                </View>

                <View style={styles.orderMetaGrid}>
                  <Text style={styles.orderMetaText}>📍 {order.distanceKm != null ? `${order.distanceKm} km to pickup` : 'Distance unavailable'}</Text>
                  <Text style={styles.orderMetaText}>⏱ {order.estimatedDeliveryTime} min est.</Text>
                  <Text style={styles.orderMetaText}>📦 {totalItemsCount(order)} items</Text>
                  <Text style={styles.orderMetaText}>💵 Total ${order.total.toFixed(2)}</Text>
                </View>

                <View style={styles.orderItems}>
                  <Text style={styles.orderAddressLabel}>Items</Text>
                  <Text style={styles.orderItem}>{formatItemsSummary(order) || 'No items listed'}</Text>
                </View>

                <View style={styles.orderAddress}>
                  <Text style={styles.orderAddressLabel}>Drop-off address</Text>
                  <Text style={styles.orderAddressValue}>{order.deliveryAddress ?? (order as DriverOrder & { address?: string | null }).address ?? 'Address unavailable'}</Text>
                </View>

                <Pressable
                  style={[styles.acceptBtn, acceptingId === order.id && styles.acceptBtnDisabled]}
                  onPress={() => handleAccept(order)}
                  disabled={!!acceptingId}
                >
                  {acceptingId === order.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept Order</Text>
                  )}
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  scroll: { paddingBottom: 32 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  headerSub: { color: '#94A3B8', fontSize: 13, marginTop: 2, fontWeight: '500' },
  onlineRow: { flexDirection: 'row', alignItems: 'center' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    margin: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  statCardMid: { backgroundColor: '#16A34A' },
  statValue: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#94A3B8', fontSize: 11, marginTop: 4, fontWeight: '600' },

  // Section
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  sectionCount: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },

  // Active Card
  activeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#16A34A',
  },
  activeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadge: { backgroundColor: '#16A34A22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { color: '#16A34A', fontWeight: '700', fontSize: 12 },
  activeEarning: { color: '#16A34A', fontSize: 20, fontWeight: '800' },
  restaurantName: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 10 },
  deliveryInfo: { marginBottom: 10 },
  deliveryLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  deliveryAddress: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  callBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  callBtnText: { color: '#94A3B8', fontWeight: '700', fontSize: 14 },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Order Card
  orderCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' },
  orderIdentityWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  restaurantLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#0F172A' },
  restaurantLogoFallback: { alignItems: 'center', justifyContent: 'center' },
  restaurantLogoFallbackText: { color: '#F8FAFC', fontWeight: '800', fontSize: 18 },
  orderCardLeft: { flex: 1 },
  orderRestaurant: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', marginLeft: 10 },
  orderTimestamp: { color: '#94A3B8', fontSize: 12, marginTop: 3, fontWeight: '600', marginLeft: 10 },
  orderEarningBadge: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center', alignItems: 'center' },
  orderEarningText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  orderEarningCaption: { color: '#DCFCE7', fontSize: 10, fontWeight: '700', marginTop: 2 },
  orderMetaGrid: { gap: 6, marginBottom: 12 },
  orderItems: { marginBottom: 10 },
  orderItem: { color: '#CBD5E1', fontSize: 13, fontWeight: '500', marginBottom: 2, lineHeight: 18 },
  orderAddress: { backgroundColor: '#0F172A', borderRadius: 10, padding: 10, marginBottom: 10 },
  orderAddressLabel: { color: '#64748B', fontSize: 10, fontWeight: '600', marginBottom: 2 },
  orderAddressValue: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },
  orderMetaText: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  acceptBtn: { backgroundColor: '#16A34A', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  acceptBtnDisabled: { opacity: 0.5 },
  acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Offline / Empty
  offlineCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 28, alignItems: 'center' },
  offlineIcon: { fontSize: 40, marginBottom: 12 },
  offlineTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  offlineSub: { color: '#64748B', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  goOnlineBtn: { backgroundColor: '#16A34A', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  goOnlineBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  emptyCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 28, alignItems: 'center' },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptySub: { color: '#64748B', fontSize: 13, textAlign: 'center' },
});
