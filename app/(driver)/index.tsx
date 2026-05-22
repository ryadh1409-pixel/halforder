import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
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
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../services/AuthContext';
import { acceptQueuedDeliveryOrder } from '../../services/driverService';
import {
  ensureDriverPresenceDoc,
  driverPresenceDoc,
  resolveDriverOnline,
  updateDriverOnlineStatus,
} from '../../services/driverPresence';
import {
  getDriverActiveOrders,
  subscribeAvailableOrders,
  subscribeDriverDeliveryStats,
  type DriverOrder,
} from '../../services/driverService';
import { showError, showSuccess } from '../../utils/toast';
import { onSnapshot } from 'firebase/firestore';

function formatOrderTime(value: number | null): string {
  if (!value) return 'Now';
  const date = new Date(value);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return isToday ? `Today ${timeLabel}` : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatItems(items: Array<{ qty?: number; quantity?: number; name?: string; title?: string }>): string {
  if (!items || items.length === 0) return '';
  return items
    .map((item) => `${item.quantity || item.qty || 1}× ${item.name || item.title || 'Item'}`)
    .join(', ');
}

function totalItemsCount(order: DriverOrder): number {
  return order.items.reduce((sum, item) => sum + (Number.isFinite(item.qty) ? item.qty : 0), 0);
}

const openMapsWithPicker = (address: string, lat?: number | null, lng?: number | null) => {
  const coords = lat && lng ? `${lat},${lng}` : null;

  const openApple = () => {
    const url = coords
      ? `maps://?q=${encodeURIComponent(address)}&ll=${coords}`
      : `maps://?q=${encodeURIComponent(address)}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Apple Maps'));
  };

  const openGoogle = async () => {
    const appUrl = coords
      ? `comgooglemaps://?daddr=${coords}`
      : `comgooglemaps://?q=${encodeURIComponent(address)}`;
    const webUrl = coords
      ? `https://www.google.com/maps/dir/?api=1&destination=${coords}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
    Linking.openURL(canOpen ? appUrl : webUrl).catch(() =>
      Alert.alert('Error', 'Could not open Google Maps'),
    );
  };

  const openWaze = async () => {
    const appUrl = coords
      ? `waze://?ll=${coords}&navigate=yes`
      : `waze://?q=${encodeURIComponent(address)}`;
    const webUrl = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
    const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
    Linking.openURL(canOpen ? appUrl : webUrl).catch(() =>
      Alert.alert('Error', 'Could not open Waze'),
    );
  };

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Open with Maps',
        options: ['Cancel', '🗺️  Apple Maps', '🟢  Google Maps', '🔵  Waze'],
        cancelButtonIndex: 0,
        userInterfaceStyle: 'dark',
      },
      (i) => {
        if (i === 1) openApple();
        if (i === 2) void openGoogle();
        if (i === 3) void openWaze();
      },
    );
  } else {
    Alert.alert('Open with Maps', 'Choose your maps app', [
      { text: '🗺️  Google Maps', onPress: () => void openGoogle() },
      { text: '🔵  Waze', onPress: () => void openWaze() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
};

const makeCall = (phone: string, name: string) => {
  if (!phone) {
    Alert.alert('No Number', `No phone number available for ${name}`);
    return;
  }
  Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() =>
    Alert.alert('Error', 'Could not open phone app'),
  );
};

function ordersListSignature(orders: DriverOrder[]): string {
  return orders
    .map((o) =>
      [
        o.id,
        o.status,
        o.driverId ?? '',
        o.total,
        o.createdAtMs ?? '',
        o.estimatedDeliveryTime,
        o.restaurantName,
        o.restaurantAddress ?? '',
        o.deliveryAddress ?? '',
        o.deliveryFee,
      ].join(':'),
    )
    .join('|');
}

export default function DriverHubScreen() {
  const { user, signOutUser, switchRoleMode } = useAuth();
  const isFocused = useIsFocused();
  const uid = user?.uid ?? '';
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [availableOrders, setAvailableOrders] = useState<DriverOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<DriverOrder[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [stats, setStats] = useState({ deliveries: 0, earnings: 0, rating: 5.0 });

  const unsubAvailableRef = useRef<(() => void) | null>(null);
  const unsubActiveRef = useRef<(() => void) | null>(null);
  const unsubStatsRef = useRef<(() => void) | null>(null);
  const unsubDriverProfileRef = useRef<(() => void) | null>(null);

  const presenceBootstrappedRef = useRef(false);
  const lastOnlineRef = useRef<boolean | null>(null);
  const lastStatsRef = useRef({ deliveries: 0, earnings: 0, rating: 5.0 });
  const profileRatingRef = useRef(5.0);
  const availableSigRef = useRef('');
  const activeSigRef = useRef('');
  const acceptingIdRef = useRef<string | null>(null);
  acceptingIdRef.current = acceptingId;

  useEffect(() => {
    if (!isFocused || !uid) return;
    if (presenceBootstrappedRef.current) return;
    presenceBootstrappedRef.current = true;
    void ensureDriverPresenceDoc(uid, user?.displayName).catch((e) => {
      console.error('[driver] ensureDriverPresenceDoc failed', e);
      presenceBootstrappedRef.current = false;
    });
  }, [isFocused, uid, user?.displayName]);

  useEffect(() => {
    if (!uid) {
      lastOnlineRef.current = null;
      presenceBootstrappedRef.current = false;
      return undefined;
    }
    if (!isFocused) {
      return undefined;
    }

    const driverRef = driverPresenceDoc(uid);
    const path = `drivers/${uid}`;
    unsubDriverProfileRef.current = onSnapshot(
      driverRef,
      (snap) => {
        const data = snap.data();
        const resolved = resolveDriverOnline(data);
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[ONLINE READ]', {
            path,
            online: data?.online,
            isOnline: data?.isOnline,
            resolved,
            exists: snap.exists(),
          });
        }
        if (lastOnlineRef.current !== resolved) {
          lastOnlineRef.current = resolved;
          setIsOnline(resolved);
        }
        if (!snap.exists()) return;
        const rating =
          typeof data?.rating === 'number' && Number.isFinite(data.rating) && data.rating > 0
            ? data.rating
            : 5.0;
        profileRatingRef.current = rating;
        setStats((prev) => ({ ...prev, rating }));
      },
      (e) => {
        console.error('[driver] drivers profile listener failed', e);
      },
    );

    unsubStatsRef.current = subscribeDriverDeliveryStats(uid, (deliveryStats) => {
      const merged = {
        deliveries: deliveryStats.deliveries,
        earnings: deliveryStats.earnings,
        rating: profileRatingRef.current > 0 ? profileRatingRef.current : 5.0,
      };
      const prev = lastStatsRef.current;
      if (
        prev.deliveries !== merged.deliveries ||
        prev.earnings !== merged.earnings ||
        prev.rating !== merged.rating
      ) {
        lastStatsRef.current = merged;
        setStats(merged);
      }
    });

    return () => {
      unsubDriverProfileRef.current?.();
      unsubDriverProfileRef.current = null;
      unsubStatsRef.current?.();
      unsubStatsRef.current = null;
    };
  }, [isFocused, uid, user?.displayName]);

  useEffect(() => {
    if (!uid) {
      availableSigRef.current = '';
      activeSigRef.current = '';
      return undefined;
    }

    const clearOrderListeners = () => {
      unsubAvailableRef.current?.();
      unsubAvailableRef.current = null;
      unsubActiveRef.current?.();
      unsubActiveRef.current = null;
    };

    if (!isFocused) {
      clearOrderListeners();
      availableSigRef.current = '';
      activeSigRef.current = '';
      setAvailableOrders([]);
      setActiveOrders([]);
      return undefined;
    }

    if (!isOnline) {
      clearOrderListeners();
      availableSigRef.current = '';
      activeSigRef.current = '';
      setAvailableOrders([]);
      setActiveOrders([]);
      return undefined;
    }

    unsubAvailableRef.current = subscribeAvailableOrders((orders) => {
      const unique = Array.from(
        new Map(orders.filter((o) => !o.driverId).map((o) => [o.id, o])).values(),
      );
      const sig = ordersListSignature(unique);
      if (sig === availableSigRef.current) return;
      availableSigRef.current = sig;
      setAvailableOrders(unique);
    });

    unsubActiveRef.current = getDriverActiveOrders(uid, (rows) => {
      const sig = ordersListSignature(rows);
      if (sig === activeSigRef.current) return;
      activeSigRef.current = sig;
      setActiveOrders(rows);
    });

    return () => {
      clearOrderListeners();
    };
  }, [isFocused, isOnline, uid]);

  useEffect(() => {
    return () => {
      unsubAvailableRef.current?.();
      unsubActiveRef.current?.();
      unsubStatsRef.current?.();
      unsubDriverProfileRef.current?.();
    };
  }, []);

  const handleToggleOnline = useCallback(
    async (nextValue: boolean) => {
      if (!uid || togglingOnline) return;
      setTogglingOnline(true);
      lastOnlineRef.current = nextValue;
      setIsOnline(nextValue);
      try {
        await updateDriverOnlineStatus(uid, nextValue);
        if (!nextValue) {
          unsubAvailableRef.current?.();
          unsubAvailableRef.current = null;
          unsubActiveRef.current?.();
          unsubActiveRef.current = null;
          availableSigRef.current = '';
          activeSigRef.current = '';
          setAvailableOrders([]);
          setActiveOrders([]);
        }
      } catch (e) {
        const reverted = !nextValue;
        lastOnlineRef.current = reverted;
        setIsOnline(reverted);
        console.error('[driver] updateDriverOnlineStatus failed', e);
        showError('Failed to update online status');
      } finally {
        setTogglingOnline(false);
      }
    },
    [togglingOnline, uid],
  );

  const handleAccept = useCallback(
    async (order: DriverOrder) => {
      if (!uid || acceptingIdRef.current) return;
      setAcceptingId(order.id);
      try {
        const res = await acceptQueuedDeliveryOrder(order.id, {
          id: uid,
          name: user?.displayName ?? 'Driver',
          phone: user?.phoneNumber ?? null,
          isOnline: true,
        });
        if (!res.ok) {
          showError(res.reason === 'already_assigned' ? 'Already assigned' : 'Could not accept order');
          return;
        }
        setAvailableOrders((prev) => prev.filter((candidate) => candidate.id !== order.id));
        showSuccess('Order accepted');
        router.replace(`/driver/active/${encodeURIComponent(order.id)}` as never);
      } catch (e) {
        console.error('[driver] accept order failed', e);
        showError('Failed to accept order');
      } finally {
        setAcceptingId(null);
      }
    },
    [uid, user?.displayName, user?.phoneNumber],
  );

  const pinnedActiveOrder = activeOrders[0] ?? null;

  const handleSwitchRole = useCallback(
    async (target: 'user' | 'restaurant' | 'driver') => {
      try {
        await switchRoleMode(target);
        if (target === 'user') {
          router.replace('/(tabs)' as never);
          return;
        }
        if (target === 'restaurant') {
          router.replace('/(host)' as never);
          return;
        }
        router.replace('/(driver)' as never);
      } catch (e) {
        console.error('[driver] switch role failed', e);
        showError('Could not switch mode right now');
      }
    },
    [router, switchRoleMode],
  );

  const openDriverSettings = useCallback(() => {
    Alert.alert('Driver settings', 'Choose an action', [
      { text: 'Switch to User Mode', onPress: () => void handleSwitchRole('user') },
      { text: 'Switch to Restaurant Mode', onPress: () => void handleSwitchRole('restaurant') },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          void signOutUser();
          router.replace('/(auth)/login' as never);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleSwitchRole, router, signOutUser]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Driver Hub</Text>
          <Text style={styles.roleBadge}>DRIVER</Text>
          <Text style={styles.headerSub}>{isOnline ? 'Online and receiving orders' : 'Offline'}</Text>
        </View>
        <View style={styles.onlineRow}>
          <Pressable style={styles.settingsBtn} onPress={openDriverSettings}>
            <Text style={styles.settingsBtnText}>Profile</Text>
          </Pressable>
          {togglingOnline ? <ActivityIndicator color="#fff" size="small" style={styles.toggleLoader} /> : null}
          <Switch
            value={isOnline}
            onValueChange={(value) => {
              void handleToggleOnline(value);
            }}
            trackColor={{ false: '#3E3E5A', true: '#00C853' }}
            thumbColor="#fff"
            disabled={!uid || togglingOnline}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.deliveries}</Text>
            <Text style={styles.statLabel}>Deliveries</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMid]}>
            <Text style={styles.statValue}>${stats.earnings.toFixed(0)}</Text>
            <Text style={styles.statLabelMid}>Earnings</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>⭐ {stats.rating.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {pinnedActiveOrder ? (
          <Pressable
            style={styles.activeCard}
            onPress={() => router.push(`/driver/active/${encodeURIComponent(pinnedActiveOrder.id)}` as never)}
          >
            <View style={styles.activeRow}>
              <Text style={styles.activeTitle}>Active Delivery</Text>
              <Text style={styles.activePayout}>${pinnedActiveOrder.total.toFixed(2)}</Text>
            </View>
            <Text style={styles.activeRestaurant}>{pinnedActiveOrder.restaurantName}</Text>
            <Text style={styles.activeMeta}>Customer: {pinnedActiveOrder.customerName ?? 'Customer'}</Text>
            <Text style={styles.activeMeta}>Drop-off: {pinnedActiveOrder.deliveryAddress ?? 'Address unavailable'}</Text>
            <Text style={styles.activeMeta}>
              Pickup: {pinnedActiveOrder.restaurantAddress ?? 'Restaurant address unavailable'}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available Orders</Text>
          <Text style={styles.sectionCount}>{availableOrders.length}</Text>
        </View>

        {!isOnline ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>You are offline</Text>
            <Text style={styles.stateSub}>Go online to receive delivery offers.</Text>
          </View>
        ) : togglingOnline ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#00C853" size="large" />
            <Text style={[styles.stateSub, { marginTop: 12 }]}>
              Updating availability…
            </Text>
          </View>
        ) : availableOrders.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>No delivery requests nearby yet.</Text>
            <Text style={styles.stateSub}>New deliveries appear in realtime.</Text>
          </View>
        ) : (
          availableOrders.map((order) => {
            const restaurantAddress = order.restaurantAddress ?? 'Address unavailable';
            const customerAddress =
              order.deliveryAddress ?? (order as DriverOrder & { address?: string | null }).address ?? 'Address unavailable';
            return (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderTop}>
                  <View style={styles.brandWrap}>
                    {order.restaurantImage ? (
                      <Image source={{ uri: order.restaurantImage }} style={styles.brandLogo} />
                    ) : (
                      <View style={[styles.brandLogo, styles.brandFallback]}>
                        <Text style={styles.brandFallbackText}>
                          {(order.restaurantName || 'R').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.brandMeta}>
                      <Text style={styles.restaurantName}>{order.restaurantName || 'Restaurant'}</Text>
                      <Text style={styles.timestamp}>{formatOrderTime(order.createdAtMs)}</Text>
                    </View>
                  </View>
                  <View style={styles.earningPill}>
                    <Text style={styles.earningText}>${(order.deliveryFee || order.total).toFixed(2)}</Text>
                    <Text style={styles.earningLabel}>Delivery fee</Text>
                  </View>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailTitle}>Restaurant</Text>
                  <Text style={styles.detailValue}>{restaurantAddress}</Text>
                  <Text style={styles.detailValue}>{order.restaurantPhone || 'Phone unavailable'}</Text>
                  <Pressable
                    style={styles.callBtn}
                    onPress={() => makeCall(order.restaurantPhone || '', order.restaurantName || 'Restaurant')}
                  >
                    <Text style={styles.callBtnText}>Call Restaurant</Text>
                  </Pressable>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailTitle}>Customer</Text>
                  <Text style={styles.detailValue}>{order.customerName || 'Customer'}</Text>
                  <Text style={styles.detailValue}>{order.customerPhone || 'Phone unavailable'}</Text>
                  <Text style={styles.detailValue}>{customerAddress}</Text>
                  <Pressable
                    style={styles.callBtn}
                    onPress={() => makeCall(order.customerPhone || '', order.customerName || 'Customer')}
                  >
                    <Text style={styles.callBtnText}>Call Customer</Text>
                  </Pressable>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailTitle}>Order Details</Text>
                  <Text style={styles.detailValue}>{formatItems(order.items) || 'No items listed'}</Text>
                  <Text style={styles.metaLine}>
                    {totalItemsCount(order)} items • {order.estimatedDeliveryTime} min •{' '}
                    {order.distanceKm != null ? `${order.distanceKm} km` : 'Distance unavailable'}
                  </Text>
                  <Text style={styles.metaLine}>Total order value: ${order.total.toFixed(2)}</Text>
                </View>

                <View style={styles.mapActions}>
                  <Pressable
                    style={styles.mapBtn}
                    onPress={() => openMapsWithPicker(restaurantAddress, order.restaurantLat, order.restaurantLng)}
                  >
                    <Text style={styles.mapBtnText}>Pickup Map</Text>
                  </Pressable>
                  <Pressable
                    style={styles.mapBtn}
                    onPress={() =>
                      openMapsWithPicker(
                        customerAddress,
                        order.deliveryLat ?? order.customerLocation?.lat ?? null,
                        order.deliveryLng ?? order.customerLocation?.lng ?? null,
                      )
                    }
                  >
                    <Text style={styles.mapBtnText}>Drop-off Map</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.acceptBtn, acceptingId === order.id && styles.acceptBtnDisabled]}
                  onPress={() => handleAccept(order)}
                  disabled={acceptingId !== null}
                >
                  {acceptingId === order.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept Order</Text>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A45',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  roleBadge: {
    color: '#93C5FD',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
    marginTop: 2,
  },
  headerSub: { color: '#9CA3AF', marginTop: 2, fontWeight: '600' },
  onlineRow: { flexDirection: 'row', alignItems: 'center' },
  settingsBtn: {
    borderWidth: 1,
    borderColor: '#3A3A5A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#151526',
  },
  settingsBtnText: { color: '#E5E7EB', fontWeight: '700', fontSize: 12 },
  toggleLoader: { marginRight: 8 },
  scroll: { padding: 14, paddingBottom: 36 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: '#22223A',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statCardMid: { backgroundColor: '#00C853' },
  statValue: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  statLabel: { color: '#9CA3AF', marginTop: 2, fontWeight: '600', fontSize: 11 },
  statLabelMid: { color: '#E7FBEA', marginTop: 2, fontWeight: '700', fontSize: 11 },
  activeCard: {
    backgroundColor: '#132B1E',
    borderWidth: 1,
    borderColor: '#00C853',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  activeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeTitle: { color: '#A7F3D0', fontWeight: '800' },
  activePayout: { color: '#00E676', fontWeight: '900', fontSize: 18 },
  activeRestaurant: { color: '#FFFFFF', marginTop: 8, fontSize: 16, fontWeight: '800' },
  activeMeta: { color: '#D1FAE5', marginTop: 4, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  sectionCount: { color: '#9CA3AF', fontWeight: '700' },
  stateCard: {
    backgroundColor: '#22223A',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  stateTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  stateSub: { color: '#9CA3AF', marginTop: 6, textAlign: 'center', fontWeight: '600' },
  orderCard: {
    backgroundColor: '#22223A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#34345A',
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  brandWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  brandLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1a1a2e' },
  brandFallback: { alignItems: 'center', justifyContent: 'center' },
  brandFallbackText: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  brandMeta: { marginLeft: 10, flex: 1 },
  restaurantName: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  timestamp: { color: '#9CA3AF', marginTop: 2, fontWeight: '600', fontSize: 12 },
  earningPill: {
    backgroundColor: '#00C853',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  earningText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  earningLabel: { color: '#D1FAE5', fontWeight: '700', fontSize: 10, marginTop: 2 },
  detailBlock: { marginBottom: 10 },
  detailTitle: { color: '#A3A3C2', fontWeight: '700', fontSize: 11, marginBottom: 3 },
  detailValue: { color: '#E5E7EB', fontWeight: '600', marginTop: 2 },
  metaLine: { color: '#9CA3AF', fontWeight: '600', marginTop: 3, fontSize: 12 },
  callBtn: {
    marginTop: 8,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3A5A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
  },
  callBtnText: { color: '#C7D2FE', fontWeight: '700', fontSize: 12 },
  mapActions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mapBtn: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#3A3A5A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
  mapBtnText: { color: '#C7D2FE', fontWeight: '700', fontSize: 12 },
  acceptBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
