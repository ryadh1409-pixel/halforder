import { LiveDeliveryMap, type MapCoord } from '@/components/logistics/LiveDeliveryMap';
import { resolveCustomerDeliveryPhase } from '@/constants/deliveryCustomerExperience';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import {
  looksLikeMarketplaceRestaurantOrder,
  subscribeOrderById,
  type RestaurantOrder,
} from '@/services/orderService';
import { orderRoomHref } from '@/services/orderChat';
import { formatAddress, formatRestaurantName } from '@/utils/orderFormatters';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CustomerLiveTrackScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id.trim() : '';
  const [order, setOrder] = useState<RestaurantOrder | null | undefined>(undefined);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return undefined;
    }
    return subscribeOrderById(orderId, setOrder, {
      onListenError: () => setOrder(null),
    });
  }, [orderId]);

  const phase = useMemo(() => {
    if (!order) return null;
    return resolveCustomerDeliveryPhase({
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
      driverId: order.driverId,
    });
  }, [order]);

  const restaurantCoord = useMemo((): MapCoord | null => {
    if (!order?.restaurantLocation) return null;
    return {
      latitude: order.restaurantLocation.lat,
      longitude: order.restaurantLocation.lng,
    };
  }, [order?.restaurantLocation]);

  const dropoffCoord = useMemo((): MapCoord | null => {
    if (!order?.deliveryLocation) return null;
    return {
      latitude: order.deliveryLocation.lat,
      longitude: order.deliveryLocation.lng,
    };
  }, [order?.deliveryLocation]);

  const driverCoord = useMemo((): MapCoord | null => {
    if (!order?.driverLocation) return null;
    const lat = Number((order.driverLocation as { lat?: unknown }).lat);
    const lng = Number((order.driverLocation as { lng?: unknown }).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  }, [order?.driverLocation]);

  const polylineCoords = useMemo((): MapCoord[] => {
    const seq: MapCoord[] = [];
    if (restaurantCoord) seq.push(restaurantCoord);
    if (driverCoord) seq.push(driverCoord);
    if (dropoffCoord) seq.push(dropoffCoord);
    return seq;
  }, [restaurantCoord, driverCoord, dropoffCoord]);

  const heading = order.driverLocation?.heading ?? null;

  async function onShare() {
    if (!orderId) return;
    const msg = `Track my HalfOrder delivery: https://halforder.app/order/${encodeURIComponent(orderId)}`;
    try {
      await Share.share({ message: msg });
    } catch {
      /* ignore */
    }
  }

  if (!orderId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.err}>Missing order</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (order === undefined) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#34D399" />
          <Text style={styles.muted}>Loading live tracking…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order || !looksLikeMarketplaceRestaurantOrder(order)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.err}>Tracking unavailable</Text>
        <Pressable onPress={() => router.replace(`/order/${encodeURIComponent(orderId)}` as never)} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Open order</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const driverChat =
    typeof order.driverId === 'string' && order.driverId.length > 0 && order.paymentStatus === 'paid';

  return (
    <View style={styles.root}>
      <View style={styles.mapWrap}>
        <LiveDeliveryMap
          polylineCoords={polylineCoords}
          restaurant={restaurantCoord}
          dropoff={dropoffCoord}
          driver={driverCoord}
          driverHeading={heading}
        />
        <SafeAreaView edges={['top']} style={styles.topBar}>
          <Pressable style={styles.circleBtn} onPress={() => router.back()}>
            <Text style={styles.circleBtnText}>‹</Text>
          </Pressable>
          <Pressable style={styles.circleBtn} onPress={() => void onShare()}>
            <Text style={styles.circleBtnText}>↗</Text>
          </Pressable>
        </SafeAreaView>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        {phase ? (
          <View style={styles.phaseCard}>
            <Text style={styles.phaseTitle}>{phase.title}</Text>
            <Text style={styles.phaseSub}>{phase.subtitle}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(phase.progress * 100)}%` }]} />
            </View>
          </View>
        ) : null}

        {order.deliveryPin && order.status !== 'delivered' ? (
          <View style={styles.pinCard}>
            <Text style={styles.pinLabel}>Delivery PIN</Text>
            <Text style={styles.pinValue}>{order.deliveryPin}</Text>
            <Text style={styles.pinHint}>Share this code only with your driver at dropoff.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver</Text>
          <View style={styles.row}>
            <View style={styles.avatar}>
              {order.driver?.avatar ? (
                <Image source={{ uri: order.driver.avatar }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarFallback}>🚗</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>
                {order.driver?.name?.trim() || order.driverName || 'Your driver'}
              </Text>
              <Text style={styles.muted}>
                {order.driver?.vehicle || order.driverVehicle || 'Vehicle on the way'}
              </Text>
              <Text style={styles.muted}>ETA ~{order.estimatedDeliveryTime} min</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionBtn, !driverChat && styles.actionDisabled]}
              disabled={!driverChat}
              onPress={() => router.push(orderRoomHref(order.id, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never)}
            >
              <Text style={styles.actionBtnText}>Chat</Text>
            </Pressable>
            {(order.driverPhone || order.driver?.phone) ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() =>
                  void Linking.openURL(`tel:${order.driver?.phone || order.driverPhone}`)
                }
              >
                <Text style={styles.actionBtnText}>Call</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Restaurant</Text>
          <Text style={styles.strong}>{formatRestaurantName(order.restaurant?.name)}</Text>
          <Text style={styles.muted}>{formatAddress(order.restaurant?.address)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dropoff</Text>
          <Text style={styles.muted}>{formatAddress(order.deliveryLocation?.address)}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  safe: { flex: 1, backgroundColor: '#020617', padding: 24 },
  mapWrap: { height: Platform.OS === 'web' ? 360 : '42%', backgroundColor: '#0f172a' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  circleBtnText: { color: '#f8fafc', fontSize: 22, fontWeight: '900' },
  sheet: { flex: 1 },
  sheetContent: { padding: 16, paddingBottom: 40 },
  phaseCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.22)',
    marginBottom: 12,
  },
  phaseTitle: { color: '#f8fafc', fontWeight: '900', fontSize: 18 },
  phaseSub: { color: 'rgba(226,232,240,0.72)', fontWeight: '600', marginTop: 6, fontSize: 14 },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#34d399',
  },
  pinCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    marginBottom: 12,
  },
  pinLabel: { color: '#fde68a', fontWeight: '800', fontSize: 12 },
  pinValue: { color: '#fffbeb', fontWeight: '900', fontSize: 32, letterSpacing: 4, marginTop: 6 },
  pinHint: { color: 'rgba(254,243,199,0.85)', fontWeight: '600', fontSize: 12, marginTop: 8 },
  card: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    marginBottom: 12,
  },
  cardTitle: { color: '#94a3b8', fontWeight: '800', fontSize: 12, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: { fontSize: 22 },
  driverName: { color: '#f8fafc', fontWeight: '900', fontSize: 17 },
  muted: { color: 'rgba(148,163,184,0.9)', fontWeight: '600', marginTop: 4 },
  strong: { color: '#e2e8f0', fontWeight: '800', fontSize: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.35)',
    alignItems: 'center',
  },
  actionDisabled: { opacity: 0.45 },
  actionBtnText: { color: '#7dd3fc', fontWeight: '900', fontSize: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: '#fecaca', fontWeight: '800', fontSize: 16 },
  backBtn: { marginTop: 16, alignSelf: 'flex-start', padding: 12 },
  backBtnText: { color: '#7dd3fc', fontWeight: '800' },
});
