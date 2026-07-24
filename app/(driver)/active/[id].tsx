import { DriverActiveRouteMap } from '@/components/maps/DriverActiveRouteMap';
import { MarketplaceDeliveryActionBar } from '@/components/delivery/MarketplaceDeliveryActionBar';
import { MarketplaceDeliveryTimeline } from '@/components/delivery/MarketplaceDeliveryTimeline';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { activeDeliveryToFulfillmentView } from '@/lib/activeDeliveryFulfillment';
import {
  applyDriverMarketplaceFulfillment,
  type DriverMarketplaceFulfillmentAction,
} from '@/lib/driverMarketplaceFulfillment';
import {
  exitDriverActiveDeliveryAfterComplete,
  isActiveDeliveryComplete,
} from '@/lib/driverDeliveryCompletion';
import { deliveryMapLegFromStatuses } from '@/lib/maps/deliveryRouteStage';
import { marketplaceDeliveryStatusLabel } from '@/lib/orderStatus';
import { useDriverActiveOrderLifecycleAlert } from '@/hooks/useOrderLifecycleAlerts';
import { useActiveDelivery } from '@/hooks/useActiveDelivery';
import { useDriverLocationTracking } from '@/hooks/useDriverLocationTracking';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { orderRoomHref } from '@/services/orderChat';
import { ROLE_ORDER_UPDATE_ERROR, showUserError } from '@/services/errors';
import { showError, showSuccess } from '@/utils/toast';
import { setDriverActiveRouteOrderId } from '@/lib/driverHubOrdersStore';
import { doc, getDoc } from 'firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value || 0);
}

function elapsedLabel(acceptedAtMs: number | null): string {
  if (!acceptedAtMs) return '0m';
  const mins = Math.max(0, Math.floor((Date.now() - acceptedAtMs) / 60000));
  return `${mins}m`;
}

function phoneFromDocData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  for (const key of ['phone', 'phoneNumber', 'whatsapp'] as const) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export default function DriverActiveDeliveryDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const completionHandledRef = useRef(false);
  const [exitingToHub, setExitingToHub] = useState(false);
  const listenersEnabled = !exitingToHub;
  const { order, loading } = useActiveDelivery(id, user?.uid, { enabled: listenersEnabled });
  const [busy, setBusy] = useState(false);
  const mapRef = useRef<unknown>(null);
  const [customerCallPhone, setCustomerCallPhone] = useState<string | null>(null);
  const [restaurantCallPhone, setRestaurantCallPhone] = useState<string | null>(null);

  useDriverActiveOrderLifecycleAlert(order);

  const isDeliveryComplete = useMemo(() => isActiveDeliveryComplete(order), [order]);

  useEffect(() => {
    if (id) setDriverActiveRouteOrderId(id);
  }, [id]);

  useEffect(() => {
    if (loading || !isDeliveryComplete || completionHandledRef.current) return;
    setExitingToHub(true);
    exitDriverActiveDeliveryAfterComplete(completionHandledRef, id, {
      toast: false,
      activeDelivery: order,
      reason: 'active_screen_exit',
    });
  }, [loading, isDeliveryComplete, id, order]);

  // Fetch Call phones from users/{customerId} and restaurants/{restaurantId}.
  useEffect(() => {
    if (!id || !order) {
      setCustomerCallPhone(null);
      setRestaurantCallPhone(null);
      return undefined;
    }

    let cancelled = false;

    void (async () => {
      try {
        const orderSnap = await getDoc(doc(db, 'orders', id));
        const data = (orderSnap.exists() ? orderSnap.data() : {}) as Record<string, unknown>;
        const restaurantObj =
          data.restaurant && typeof data.restaurant === 'object'
            ? (data.restaurant as Record<string, unknown>)
            : null;

        const customerId =
          (typeof order.customerId === 'string' && order.customerId.trim()
            ? order.customerId.trim()
            : null) ||
          (typeof data.userId === 'string' && data.userId.trim()
            ? data.userId.trim()
            : null) ||
          (typeof data.customerId === 'string' && data.customerId.trim()
            ? data.customerId.trim()
            : null);

        const restaurantId =
          (typeof data.restaurantId === 'string' && data.restaurantId.trim()
            ? data.restaurantId.trim()
            : null) ||
          (typeof data.venueId === 'string' && data.venueId.trim()
            ? data.venueId.trim()
            : null) ||
          (restaurantObj &&
          typeof restaurantObj.id === 'string' &&
          restaurantObj.id.trim()
            ? restaurantObj.id.trim()
            : null);

        const [userSnap, restaurantSnap] = await Promise.all([
          customerId
            ? getDoc(doc(db, 'users', customerId)).catch(() => null)
            : Promise.resolve(null),
          restaurantId
            ? getDoc(doc(db, 'restaurants', restaurantId)).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const fromUser = phoneFromDocData(
          userSnap && 'exists' in userSnap && userSnap.exists()
            ? (userSnap.data() as Record<string, unknown>)
            : undefined,
        );
        const fromRestaurant = phoneFromDocData(
          restaurantSnap && 'exists' in restaurantSnap && restaurantSnap.exists()
            ? (restaurantSnap.data() as Record<string, unknown>)
            : undefined,
        );

        setCustomerCallPhone(fromUser || order.customerPhone || null);
        setRestaurantCallPhone(fromRestaurant || order.restaurantPhone || null);
      } catch {
        if (cancelled) return;
        setCustomerCallPhone(order.customerPhone || null);
        setRestaurantCallPhone(order.restaurantPhone || null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, order?.id, order?.customerId, order?.customerPhone, order?.restaurantPhone]);

  const { current: currentLocation, permissionGranted } = useDriverLocationTracking(
    id,
    user?.uid,
    Boolean(id && user?.uid && listenersEnabled && !isDeliveryComplete),
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
    const leg = deliveryMapLegFromStatuses(
      order.marketplaceCourierStatus ?? order.firestoreDeliveryStatus,
      order.status,
    );
    const destination =
      leg === 'to_customer' ? order.customerLocation : order.restaurantLocation;
    const list: { latitude: number; longitude: number }[] = [];
    if (driver) list.push({ latitude: driver.lat, longitude: driver.lng });
    if (destination) {
      list.push({ latitude: destination.lat, longitude: destination.lng });
    }
    return list;
  }, [driverLocationForMap, order]);

  const fulfillmentOrder = useMemo(
    () => (order && id ? activeDeliveryToFulfillmentView(order, id) : null),
    [
      id,
      order?.marketplaceCourierStatus,
      order?.firestoreDeliveryStatus,
      order?.updatedAtMs,
      order?.driverId,
      order?.assignedDriverId,
      order?.status,
    ],
  );

  async function onFulfillmentAction(action: DriverMarketplaceFulfillmentAction) {
    if (!id || busy || !order || !fulfillmentOrder) return;
    setBusy(true);
    try {
      const result = await applyDriverMarketplaceFulfillment(id, action, fulfillmentOrder);
      if (result === 'skipped_illegal') {
        if (action === 'arrive_restaurant') {
          showError('Cannot mark arrival for this order yet.');
        } else if (action === 'pickup') {
          showError('Confirm arrival at the restaurant before pickup.');
        } else {
          showError('Pick up the order before completing delivery.');
        }
        return;
      }
      if (result === 'skipped_duplicate') {
        showUserError(new Error('delivery_status_duplicate'), {
          role: 'driver',
          context: 'driver',
          fallback: ROLE_ORDER_UPDATE_ERROR.driver,
        });
        return;
      }
      if (action === 'arrive_restaurant') {
        showSuccess('Arrived at restaurant');
      } else if (action === 'pickup') {
        showSuccess('Pickup confirmed');
      } else if (result === 'applied' && action === 'deliver') {
        setExitingToHub(true);
        exitDriverActiveDeliveryAfterComplete(completionHandledRef, id, {
          activeDelivery: order,
          reason: 'active_screen_exit',
        });
      }
    } catch (error) {
      showUserError(error, {
        role: 'driver',
        context: 'driver',
        fallback: ROLE_ORDER_UPDATE_ERROR.driver,
      });
    } finally {
      setBusy(false);
    }
  }

  if (exitingToHub || isDeliveryComplete) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color="#22C55E" />
        <Text style={styles.exitLabel}>Returning to Driver Hub…</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color="#22C55E" />
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
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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
              onPress={() => onCall(restaurantCallPhone, 'Restaurant')}
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
              onPress={() => onCall(customerCallPhone, 'Customer')}
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
        <View style={styles.timelineActionSpacer} />
      </ScrollView>
      {fulfillmentOrder && !isDeliveryComplete ? (
        <View style={styles.stickyAction}>
          <MarketplaceDeliveryActionBar
            key={`${fulfillmentOrder.id}:${String(fulfillmentOrder.deliveryStatus)}:${activeOrder.updatedAtMs ?? ''}`}
            order={fulfillmentOrder}
            driverUid={user?.uid}
            busy={busy}
            onAction={(action) => void onFulfillmentAction(action)}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020617' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617' },
  exitLabel: { color: '#7D8493', marginTop: 12, fontSize: 15 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  timelineActionSpacer: { height: 8 },
  stickyAction: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E2230',
    backgroundColor: '#171923',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  headerCard: {
    backgroundColor: '#171923',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E2230',
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
  metric: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  card: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E2230',
    backgroundColor: '#171923',
    padding: 14,
  },
  cardTitle: { color: '#FFFFFF', fontWeight: '800', marginBottom: 10 },
  map: { height: 240, borderRadius: 12 },
  mapFallback: {
    height: 180,
    borderRadius: 12,
    backgroundColor: '#000000',
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
  secondaryBtnText: { color: '#7D8493', fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', gap: 10 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#334155' },
  logoFallback: { opacity: 0.3 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  meta: { color: '#7D8493', marginTop: 3, fontWeight: '600' },
  metaStrong: { color: 'rgba(255,255,255,0.1)', fontWeight: '700', marginTop: 3 },
  rowButtons: { marginTop: 10, flexDirection: 'row', gap: 8 },
  smallBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    alignItems: 'center',
  },
  smallBtnText: { color: '#7D8493', fontWeight: '700' },
  itemRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#1E2230',
    paddingVertical: 8,
  },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  payout: { color: '#22C55E', fontWeight: '900' },
});
