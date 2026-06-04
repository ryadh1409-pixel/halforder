import { DriverActiveRouteMap } from '@/components/maps/DriverActiveRouteMap';
import { MarketplaceDeliveryActionBar } from '@/components/delivery/MarketplaceDeliveryActionBar';
import { MarketplaceDeliveryTimeline } from '@/components/delivery/MarketplaceDeliveryTimeline';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { applyDriverMarketplaceFulfillment } from '@/lib/driverMarketplaceFulfillment';
import { marketplaceDeliveryStatusLabel } from '@/lib/orderStatus';
import { useActiveDelivery } from '@/hooks/useActiveDelivery';
import { useDriverLocationTracking } from '@/hooks/useDriverLocationTracking';
import { useAuth } from '@/services/AuthContext';
import { orderRoomHref } from '@/services/orderChat';
import { showError, showSuccess } from '@/utils/toast';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
}

function elapsedLabel(acceptedAtMs: number | null): string {
  if (!acceptedAtMs) return '0m';
  const mins = Math.max(0, Math.floor((Date.now() - acceptedAtMs) / 60000));
  return `${mins}m`;
}

export default function DriverActiveDeliveryDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { order, loading } = useActiveDelivery(id);
  const [busy, setBusy] = useState(false);
  const mapRef = useRef<unknown>(null);

  const { current: currentLocation, permissionGranted } = useDriverLocationTracking(
    id,
    user?.uid,
    Boolean(id && user?.uid),
  );

  const driverLocationForMap = useMemo(
    () =>
      currentLocation
        ? {
            lat: currentLocation.latitude,
            lng: currentLocation.longitude,
            heading: currentLocation.heading ?? null,
            speed: currentLocation.speed ?? null,
          }
        : null,
    [currentLocation],
  );

  const points = useMemo(() => {
    if (!order) return [];
    const driver = driverLocationForMap ?? order.driverLocation;
    const restaurant = order.restaurantLocation;
    const customer = order.customerLocation;
    const list: { latitude: number; longitude: number }[] = [];
    if (driver) list.push({ latitude: driver.lat, longitude: driver.lng });
    if (restaurant) list.push({ latitude: restaurant.lat, longitude: restaurant.lng });
    if (customer) list.push({ latitude: customer.lat, longitude: customer.lng });
    return list;
  }, [driverLocationForMap, order]);

  async function onPickup() {
    if (!id || busy) return;
    setBusy(true);
    try {
      const result = await applyDriverMarketplaceFulfillment(id, 'pickup', order ?? undefined);
      if (result === 'skipped_illegal') {
        showError('Order is not ready for pickup yet.');
        return;
      }
      showSuccess('Picked up');
    } catch {
      showError('Could not mark order picked up');
    } finally {
      setBusy(false);
    }
  }

  async function onDeliver() {
    if (!id || busy) return;
    setBusy(true);
    try {
      const result = await applyDriverMarketplaceFulfillment(id, 'deliver', order ?? undefined);
      if (result === 'skipped_illegal') {
        showError('Pick up the order before completing delivery.');
        return;
      }
      showSuccess('Delivered');
    } catch {
      showError('Could not complete delivery');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color="#16A34A" />
      </SafeAreaView>
    );
  }

  if (!id || !order) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Text style={styles.title}>Delivery not found</Text>
      </SafeAreaView>
    );
  }

  const activeOrder = order;

  const courierStatus = activeOrder.marketplaceCourierStatus;
  const statusLabel = marketplaceDeliveryStatusLabel(courierStatus);
  const routeDestination = activeOrder.deliveryAddress;

  function onCall(phone: string | null | undefined, label: string) {
    const normalized = typeof phone === 'string' ? phone.replace(/\s/g, '').trim() : '';
    console.log('[CALL BUTTON]', { label, phone: normalized || phone || null, orderId: id });
    if (!normalized) {
      showError(`${label} phone unavailable`);
      return;
    }
    void Linking.openURL(`tel:${normalized}`).catch(() => {
      showError('Could not open phone app');
    });
  }

  function onChatCustomer() {
    console.log('[CHAT BUTTON]', activeOrder.customerId ?? null);
    if (!id) {
      showError('Order id missing');
      return;
    }
    router.push(orderRoomHref(id, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never);
  }

  function onChatRestaurant() {
    console.log('[CHAT BUTTON]', activeOrder.customerId ?? null);
    if (!id) {
      showError('Order id missing');
      return;
    }
    router.push(orderRoomHref(id, ORDER_CHAT_TYPE.RESTAURANT_DRIVER) as never);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{statusLabel}</Text>
          </View>
          <View style={styles.metrics}>
            <Text style={styles.metric}>Earnings {money(order.payout)}</Text>
            <Text style={styles.metric}>ETA {order.estimatedDurationMin}m</Text>
            <Text style={styles.metric}>Active {elapsedLabel(order.acceptedAtMs)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live route</Text>
          {points.length > 0 && order ? (
            <DriverActiveRouteMap
              mapRef={mapRef}
              order={order}
              currentLocation={driverLocationForMap}
              points={points}
            />
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.meta}>
                {permissionGranted
                  ? 'Waiting for live coordinates…'
                  : 'Enable location permission for realtime route'}
              </Text>
            </View>
          )}
          <View style={styles.mapsRow}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() =>
                routeDestination
                  ? Linking.openURL(`http://maps.apple.com/?daddr=${encodeURIComponent(routeDestination)}`)
                  : undefined
              }
            >
              <Text style={styles.secondaryBtnText}>Open in Apple Maps</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() =>
                routeDestination
                  ? Linking.openURL(
                      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                        routeDestination,
                      )}`,
                    )
                  : undefined
              }
            >
              <Text style={styles.secondaryBtnText}>Open in Google Maps</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Restaurant</Text>
          <View style={styles.row}>
            {order.restaurantImage ? (
              <Image source={{ uri: order.restaurantImage }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoFallback]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{order.restaurantName}</Text>
              <Text style={styles.meta}>{order.restaurantAddress ?? 'Address unavailable'}</Text>
              <Text style={styles.meta}>Pickup notes: {order.pickupNotes ?? 'None'}</Text>
            </View>
          </View>
          <View style={styles.rowButtons}>
            <Pressable
              style={styles.smallBtn}
              onPress={() => onCall(order.restaurantPhone, 'Restaurant')}
            >
              <Text style={styles.smallBtnText}>Call</Text>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={onChatRestaurant}>
              <Text style={styles.smallBtnText}>Chat</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <Text style={styles.title}>{order.customerName ?? 'Customer'}</Text>
          <Text style={styles.meta}>{order.deliveryAddress ?? 'Address unavailable'}</Text>
          <Text style={styles.meta}>Instructions: {order.customerInstructions ?? order.notes ?? 'None'}</Text>
          <View style={styles.rowButtons}>
            <Pressable
              style={styles.smallBtn}
              onPress={() => onCall(order.customerPhone, 'Customer')}
            >
              <Text style={styles.smallBtnText}>Call</Text>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={onChatCustomer}>
              <Text style={styles.smallBtnText}>Chat</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order items</Text>
          {order.items.map((item, idx) => (
            <View key={`${item.name}-${idx}`} style={styles.itemRow}>
              <Text style={styles.metaStrong}>
                {item.qty}x {item.name}
              </Text>
              <Text style={styles.meta}>
                {item.modifiers && item.modifiers.length > 0 ? item.modifiers.join(', ') : 'No modifiers'}
              </Text>
            </View>
          ))}
          <View style={styles.financialRow}>
            <Text style={styles.meta}>Subtotal</Text>
            <Text style={styles.metaStrong}>{money(order.subtotal)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.meta}>Fees</Text>
            <Text style={styles.metaStrong}>{money(order.fees)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.meta}>Payout</Text>
            <Text style={styles.payout}>{money(order.payout)}</Text>
          </View>
        </View>

        <MarketplaceDeliveryTimeline status={courierStatus} />
        <MarketplaceDeliveryActionBar
          order={order}
          driverUid={user?.uid}
          busy={busy}
          onPickup={() => void onPickup()}
          onDeliver={() => void onDeliver()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020617' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617' },
  content: { padding: 16, paddingBottom: 36 },
  headerCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#052E16',
    borderWidth: 1,
    borderColor: '#166534',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { color: '#22C55E', fontWeight: '800', fontSize: 12 },
  metrics: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  metric: { color: '#F8FAFC', fontWeight: '700', fontSize: 13 },
  card: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#111827',
    padding: 14,
  },
  cardTitle: { color: '#F8FAFC', fontWeight: '800', marginBottom: 10 },
  map: { height: 240, borderRadius: 12 },
  mapFallback: {
    height: 180,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  mapsRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  secondaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#CBD5E1', fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', gap: 10 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#334155' },
  logoFallback: { opacity: 0.3 },
  title: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  meta: { color: '#94A3B8', marginTop: 3, fontWeight: '600' },
  metaStrong: { color: '#E2E8F0', fontWeight: '700', marginTop: 3 },
  rowButtons: { marginTop: 10, flexDirection: 'row', gap: 8 },
  smallBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    alignItems: 'center',
  },
  smallBtnText: { color: '#CBD5E1', fontWeight: '700' },
  itemRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    paddingVertical: 8,
  },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  payout: { color: '#22C55E', fontWeight: '900' },
});
