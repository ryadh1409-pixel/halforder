import AppHeader from '../../../components/AppHeader';
import {
  subscribeOrderById,
  type OrderStatus,
  type RestaurantOrder,
} from '../../../services/orderService';
import { showNotice } from '../../../utils/toast';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TIMELINE: { status: OrderStatus; label: string }[] = [
  { status: 'awaiting_payment', label: 'Awaiting payment' },
  { status: 'pending', label: 'Order placed' },
  { status: 'accepted', label: 'Restaurant accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready for pickup' },
  { status: 'picked_up', label: 'Picked up' },
  { status: 'on_the_way', label: 'On the way' },
  { status: 'delivered', label: 'Delivered' },
];

function statusIndex(status: OrderStatus | undefined): number {
  if (!status || status === 'rejected') return -1;
  const i = TIMELINE.findIndex((s) => s.status === status);
  return i >= 0 ? i : 0;
}

function badgeForStatus(status: OrderStatus | undefined): { bg: string; fg: string } {
  switch (status) {
    case 'awaiting_payment':
      return { bg: '#E2E8F0', fg: '#334155' };
    case 'pending':
      return { bg: '#FEF3C7', fg: '#92400E' };
    case 'accepted':
    case 'preparing':
      return { bg: '#DBEAFE', fg: '#1E3A8A' };
    case 'ready':
      return { bg: '#D1FAE5', fg: '#065F46' };
    case 'picked_up':
    case 'on_the_way':
      return { bg: '#E0F2FE', fg: '#0369A1' };
    case 'delivered':
      return { bg: '#ECFDF5', fg: '#166534' };
    case 'rejected':
      return { bg: '#FEE2E2', fg: '#991B1B' };
    default:
      return { bg: '#F1F5F9', fg: '#475569' };
  }
}

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [order, setOrder] = useState<RestaurantOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const lastStatusRef = useRef<string | null>(null);

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

  const stepDone = useMemo(() => statusIndex(order?.status), [order?.status]);

  useEffect(() => {
    if (!order?.status) return;
    const prev = lastStatusRef.current;
    if (prev === order.status) return;
    if (order.status === 'accepted') {
      showNotice('Order update', 'Restaurant accepted your order.');
    }
    if (order.status === 'on_the_way') {
      showNotice('Order update', 'Your driver is on the way.');
    }
    if (order.status === 'delivered') {
      showNotice('Order update', 'Your order was delivered.');
    }
    lastStatusRef.current = order.status;
  }, [order?.status]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <AppHeader title="Track order" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      </SafeAreaView>
    );
  }

  if (!id || !order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Track order" />
        <View style={styles.centered}>
          <Text style={styles.fallbackTitle}>Order not found</Text>
          <Text style={styles.fallbackSub}>Check your link or order ID.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const driverLat =
    order.driverLocation?.lat ??
    order.deliveryLocation?.lat ??
    order.userLocation?.lat ??
    43.65;
  const driverLng =
    order.driverLocation?.lng ??
    order.deliveryLocation?.lng ??
    order.userLocation?.lng ??
    -79.38;

  const badge = badgeForStatus(order.status);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Track order" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.orderId}>Order #{order.id.slice(0, 10)}…</Text>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusBadgeText, { color: badge.fg }]}>
            {(order.status ?? 'pending').replace('_', ' ')}
          </Text>
        </View>

        {order.estimatedDeliveryTime ? (
          <View style={styles.etaChip}>
            <Text style={styles.etaChipText}>ETA ~{order.estimatedDeliveryTime} min</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver</Text>
          <Text style={styles.meta}>
            {order.driverName?.trim() ? order.driverName : 'Matching a driver…'}
          </Text>
          {order.driverPhone ? (
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(`tel:${order.driverPhone}`)}
            >
              Call {order.driverPhone}
            </Text>
          ) : (
            <Text style={styles.muted}>Phone unavailable</Text>
          )}
          {order.driverVehicle ? (
            <Text style={styles.meta}>Vehicle: {order.driverVehicle}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live map</Text>
          <Text style={styles.mapHint}>
            {order.status === 'on_the_way' || order.status === 'picked_up'
              ? 'Driver location updates automatically.'
              : 'Map activates when your order is out for delivery.'}
          </Text>
          <View style={styles.mapPlaceholder}>
            <View style={styles.mapGrid} />
            <View style={styles.mapPin} />
            <Text style={styles.mapCoords}>
              {driverLat.toFixed(4)}, {driverLng.toFixed(4)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Timeline</Text>
          {TIMELINE.map((step, idx) => {
            const done = order.status !== 'rejected' && idx <= stepDone;
            const current = order.status === step.status;
            return (
              <View key={step.status} style={styles.stepRow}>
                <View
                  style={[
                    styles.dot,
                    done && styles.dotOn,
                    current && styles.dotCurrent,
                  ]}
                />
                <Text style={[styles.stepLabel, done && styles.stepLabelOn]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <Text style={styles.meta}>To: {order.deliveryLocation?.address ?? '—'}</Text>
          <Text style={styles.meta}>Total ${order.totalPrice.toFixed(2)}</Text>
          {order.items?.length ? (
            order.items.map((item) => (
              <Text key={`${item.id}-${item.name}`} style={styles.itemLine}>
                {item.qty}× {item.name}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>No line items</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  orderId: { color: '#64748B', fontWeight: '700' },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeText: { fontWeight: '800', textTransform: 'capitalize' },
  etaChip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  etaChipText: { color: '#166534', fontWeight: '800', fontSize: 12 },
  card: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  meta: { color: '#475569', fontWeight: '600', marginTop: 4 },
  muted: { color: '#94A3B8', marginTop: 4, fontWeight: '600' },
  link: { color: '#2563EB', fontWeight: '800', marginTop: 8 },
  mapHint: { color: '#64748B', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  mapPlaceholder: {
    height: 180,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    overflow: 'hidden',
    position: 'relative',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
    backgroundColor: '#C7D2FE',
  },
  mapPin: {
    position: 'absolute',
    left: '50%',
    top: '42%',
    marginLeft: -9,
    marginTop: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#16A34A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  mapCoords: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#CBD5E1',
    marginRight: 12,
  },
  dotOn: { backgroundColor: '#22C55E' },
  dotCurrent: { borderWidth: 2, borderColor: '#15803D' },
  stepLabel: { color: '#64748B', fontWeight: '600', flex: 1 },
  stepLabelOn: { color: '#0F172A', fontWeight: '800' },
  itemLine: { color: '#334155', marginTop: 4, fontWeight: '600' },
  fallbackTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  fallbackSub: { marginTop: 8, color: '#64748B', textAlign: 'center' },
});
