import AppHeader from '@/components/AppHeader';
import { DeliveryProgressBar } from '@/components/order/DeliveryProgressBar';
import { DeliveryTimeline } from '@/components/order/DeliveryTimeline';
import { OrderPaymentTimeline } from '@/components/order/OrderPaymentTimeline';
import { ETAChip } from '@/components/order/ETAChip';
import type { OrderStatus, RestaurantOrder } from '@/services/orderService';
import { normalizeDeliveryStatus } from '@/services/deliveryStatus';
import { showNotice } from '@/utils/toast';
import * as Linking from 'expo-linking';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TIMELINE: { status: OrderStatus; label: string }[] = [
  { status: 'awaiting_payment', label: 'Awaiting payment' },
  { status: 'pending_driver', label: 'Finding a driver' },
  { status: 'pending', label: 'Order placed' },
  { status: 'restaurant_accepted', label: 'Restaurant accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready_for_pickup', label: 'Ready for pickup' },
  { status: 'picked_up', label: 'Picked up' },
  { status: 'on_the_way', label: 'On the way' },
  { status: 'arrived_customer', label: 'Arrived nearby' },
  { status: 'delivered', label: 'Delivered' },
];

let MapViewModule: typeof import('react-native-maps') | null = null;
if (Platform.OS !== 'web') {
  try {
    MapViewModule = require('react-native-maps');
  } catch {
    MapViewModule = null;
  }
}
const MapView = MapViewModule?.default;
const Marker = MapViewModule?.Marker;
const Polyline = MapViewModule?.Polyline;

function statusIndex(status: OrderStatus | undefined): number {
  if (!status || status === 'rejected' || status === 'payment_failed') return -1;
  if (status === 'payment_processing') {
    return Math.max(0, TIMELINE.findIndex((s) => s.status === 'awaiting_payment'));
  }
  const i = TIMELINE.findIndex((s) => s.status === status);
  return i >= 0 ? i : 0;
}

function chipForFulfillment(status: OrderStatus | undefined): { bg: string; fg: string } {
  switch (status) {
    case 'awaiting_payment':
    case 'payment_processing':
      return { bg: 'rgba(148,163,184,0.35)', fg: '#E2E8F0' };
    case 'payment_failed':
      return { bg: 'rgba(239,68,68,0.25)', fg: '#FECACA' };
    case 'pending_driver':
      return { bg: 'rgba(234,179,8,0.25)', fg: '#FDE68A' };
    case 'pending':
      return { bg: 'rgba(251,191,36,0.2)', fg: '#FCD34D' };
    case 'restaurant_accepted':
    case 'preparing':
      return { bg: 'rgba(59,130,246,0.25)', fg: '#BFDBFE' };
    case 'ready_for_pickup':
      return { bg: 'rgba(34,197,94,0.2)', fg: '#BBF7D0' };
    case 'picked_up':
    case 'on_the_way':
    case 'arrived_customer':
      return { bg: 'rgba(56,189,248,0.22)', fg: '#E0F2FE' };
    case 'delivered':
      return { bg: 'rgba(34,197,94,0.28)', fg: '#DCFCE7' };
    case 'cancelled':
    case 'rejected':
      return { bg: 'rgba(248,113,113,0.2)', fg: '#FECACA' };
    default:
      return { bg: 'rgba(255,255,255,0.08)', fg: '#CBD5E1' };
  }
}

function paymentBadge(paymentStatus: RestaurantOrder['paymentStatus']): {
  label: string;
  bg: string;
  fg: string;
} {
  switch (paymentStatus) {
    case 'paid':
      return { label: 'Paid', bg: 'rgba(34,197,94,0.25)', fg: '#BBF7D0' };
    case 'processing':
      return { label: 'Processing', bg: 'rgba(251,191,36,0.2)', fg: '#FDE68A' };
    case 'failed':
      return { label: 'Payment issue', bg: 'rgba(239,68,68,0.25)', fg: '#FECACA' };
    case 'refunded':
      return { label: 'Refunded', bg: 'rgba(148,163,184,0.25)', fg: '#E2E8F0' };
    default:
      return { label: 'Unpaid', bg: 'rgba(148,163,184,0.2)', fg: '#CBD5E1' };
  }
}

function driverStatusLabel(order: RestaurantOrder): string {
  const d = normalizeDeliveryStatus(order.deliveryStatus);
  const map: Record<string, string> = {
    waiting_driver: 'Finding driver',
    driver_assigned: 'Driver assigned',
    heading_to_restaurant: 'Heading to restaurant',
    arrived_restaurant: 'At restaurant',
    picked_up: 'Picked up',
    on_the_way: 'On the way',
    near_customer: 'Nearby',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  return map[d] ?? String(d).replace(/_/g, ' ');
}

/** Presentational live tracker — parent owns the Firestore subscription. */
export function MarketplaceOrderTracking({ order }: { order: RestaurantOrder }) {
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [
    order.status,
    order.paymentStatus,
    order.estimatedDeliveryTime,
    order.driverName,
    order.driverLocation?.lat,
  ]);

  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!order.status) return;
    const prev = lastStatusRef.current;
    if (prev === order.status) return;
    if (order.status === 'restaurant_accepted') {
      showNotice('Order update', 'Restaurant accepted your order.');
    }
    if (order.status === 'on_the_way') {
      showNotice('Order update', 'Your driver is on the way.');
    }
    if (order.status === 'arrived_customer') {
      showNotice('Order update', 'Your driver is near your location.');
    }
    if (order.status === 'delivered') {
      showNotice('Order update', 'Your order was delivered.');
    }
    lastStatusRef.current = order.status;
  }, [order.status]);

  const stepDone = useMemo(() => statusIndex(order.status), [order.status]);

  const mapPoints = useMemo(() => {
    return [
      order.driverLocation
        ? { latitude: order.driverLocation.lat, longitude: order.driverLocation.lng }
        : null,
      order.restaurantLocation
        ? {
            latitude: order.restaurantLocation.lat,
            longitude: order.restaurantLocation.lng,
          }
        : null,
      order.deliveryLocation
        ? {
            latitude: order.deliveryLocation.lat,
            longitude: order.deliveryLocation.lng,
          }
        : null,
    ].filter((p): p is { latitude: number; longitude: number } => Boolean(p));
  }, [order]);

  const statusChip = chipForFulfillment(order.status);
  const payChip = paymentBadge(order.paymentStatus);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Track order" />
      <ScrollView
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.stickyHeader}>
          <Text style={styles.orderId}>Order #{order.id.slice(0, 10)}…</Text>
          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: statusChip.bg }]}>
              <Text style={[styles.chipText, { color: statusChip.fg }]}>
                {(order.status ?? 'pending').replace(/_/g, ' ')}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: payChip.bg }]}>
              <Text style={[styles.chipText, { color: payChip.fg }]}>{payChip.label}</Text>
            </View>
          </View>
          <Text style={styles.driverLine}>Driver: {driverStatusLabel(order)}</Text>
          {order.estimatedDeliveryTime ? (
            <View style={styles.etaWrap}>
              <ETAChip minutes={order.estimatedDeliveryTime} />
            </View>
          ) : null}
          <View style={styles.progressWrap}>
            <DeliveryProgressBar progress={(stepDone + 1) / TIMELINE.length} />
          </View>
        </View>

        <OrderPaymentTimeline order={order} variant="dark" />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver</Text>
          <Text style={styles.meta}>
            {order.driverName?.trim() ? order.driverName : 'Matching a driver…'}
          </Text>
          {order.driverPhone ? (
            <Text
              style={styles.link}
              onPress={() => void Linking.openURL(`tel:${order.driverPhone}`)}
            >
              Call driver
            </Text>
          ) : (
            <Text style={styles.muted}>Phone unavailable until assigned</Text>
          )}
          {order.driverVehicle ? (
            <Text style={styles.meta}>Vehicle: {order.driverVehicle}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live map</Text>
          <Text style={styles.mapHint}>
            {order.status === 'on_the_way' ||
            order.status === 'picked_up' ||
            order.status === 'arrived_customer'
              ? 'Driver location updates automatically.'
              : 'Map highlights restaurant and dropoff.'}
          </Text>
          <View style={styles.mapHost}>
            {MapView && mapPoints.length > 0 ? (
              <MapView
                style={styles.mapReal}
                initialRegion={{
                  latitude: mapPoints[0].latitude,
                  longitude: mapPoints[0].longitude,
                  latitudeDelta: 0.08,
                  longitudeDelta: 0.08,
                }}
              >
                {order.driverLocation ? (
                  <Marker
                    coordinate={{
                      latitude: order.driverLocation.lat,
                      longitude: order.driverLocation.lng,
                    }}
                    title="Driver"
                    pinColor="#22C55E"
                  />
                ) : null}
                {order.restaurantLocation ? (
                  <Marker
                    coordinate={{
                      latitude: order.restaurantLocation.lat,
                      longitude: order.restaurantLocation.lng,
                    }}
                    title="Restaurant"
                    pinColor="#F59E0B"
                  />
                ) : null}
                {order.deliveryLocation ? (
                  <Marker
                    coordinate={{
                      latitude: order.deliveryLocation.lat,
                      longitude: order.deliveryLocation.lng,
                    }}
                    title="Dropoff"
                    pinColor="#38BDF8"
                  />
                ) : null}
                {mapPoints.length >= 2 ? (
                  <Polyline coordinates={mapPoints} strokeWidth={4} strokeColor="#34D399" />
                ) : null}
              </MapView>
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.muted}>Map preview unavailable</Text>
              </View>
            )}
          </View>
        </View>

        <DeliveryTimeline steps={TIMELINE} status={order.status} variant="dark" />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery details</Text>
          <Text style={styles.metaStrong}>Address</Text>
          <Text style={styles.meta}>{order.deliveryLocation?.address ?? '—'}</Text>
          <Text style={styles.metaStrong}>Items</Text>
          {order.items?.length ? (
            order.items.slice(0, 8).map((item) => (
              <Text key={`${item.id}-${item.name}`} style={styles.itemLine}>
                {item.qty}× {item.name}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>No line items</Text>
          )}
          {order.items.length > 8 ? (
            <Text style={styles.muted}>+ more items</Text>
          ) : null}
          <View style={styles.priceBlock}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Subtotal</Text>
              <Text style={styles.priceVal}>${order.subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Fees / tax</Text>
              <Text style={styles.priceVal}>${(order.tax + order.deliveryFee).toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalVal}>${order.totalPrice.toFixed(2)}</Text>
            </View>
          </View>
          <Text style={styles.metaStrong}>Participants</Text>
          <Text style={styles.meta}>Primary guest (your account)</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#06080C' },
  scrollContent: { paddingBottom: 48 },
  stickyHeader: {
    backgroundColor: '#06080C',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  orderId: { color: 'rgba(148,163,184,0.95)', fontWeight: '700', paddingHorizontal: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontWeight: '800', fontSize: 12, textTransform: 'capitalize' },
  driverLine: {
    marginTop: 10,
    paddingHorizontal: 16,
    color: 'rgba(226,232,240,0.85)',
    fontWeight: '600',
    fontSize: 13,
  },
  etaWrap: { marginTop: 10, paddingHorizontal: 16 },
  progressWrap: { marginTop: 14, paddingHorizontal: 16 },
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0E1218',
    padding: 16,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC', marginBottom: 10 },
  meta: { color: 'rgba(226,232,240,0.78)', fontWeight: '600', marginTop: 4, fontSize: 14 },
  metaStrong: {
    color: '#94A3B8',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  muted: { color: 'rgba(148,163,184,0.85)', marginTop: 4, fontWeight: '600', fontSize: 13 },
  link: { color: '#7DD3FC', fontWeight: '800', marginTop: 10, fontSize: 15 },
  mapHint: { color: 'rgba(148,163,184,0.9)', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  mapHost: { borderRadius: 14, overflow: 'hidden', minHeight: 200 },
  mapReal: { height: 220, width: '100%' },
  mapPlaceholder: {
    height: 200,
    borderRadius: 14,
    backgroundColor: '#11161F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLine: { color: '#E2E8F0', marginTop: 4, fontWeight: '600', fontSize: 14 },
  priceBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  priceLabel: { color: 'rgba(226,232,240,0.72)', fontWeight: '600', fontSize: 14 },
  priceVal: { color: '#F8FAFC', fontWeight: '700', fontSize: 14 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  totalLabel: { color: '#F8FAFC', fontWeight: '800', fontSize: 16 },
  totalVal: { color: '#34D399', fontWeight: '900', fontSize: 17 },
});
