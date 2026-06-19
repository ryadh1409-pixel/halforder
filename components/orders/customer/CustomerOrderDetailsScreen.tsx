import AppHeader from '@/components/AppHeader';
import { CustomerMarketplaceTimeline } from '@/components/order/CustomerMarketplaceTimeline';
import { OrderRatingPrompt } from '@/components/order-rating-prompt';
import { DeliveryProgressBar } from '@/components/order/DeliveryProgressBar';
import { OrderPaymentTimeline } from '@/components/order/OrderPaymentTimeline';
import { ETAChip } from '@/components/order/ETAChip';
import {
  chipForFulfillment,
  driverStatusLabel,
  paymentBadge,
} from '@/components/orders/shared/marketplaceTrackingParts';
import {
  CUSTOMER_MARKETPLACE_TIMELINE,
  customerMarketplaceTimelineIndex,
} from '@/lib/customerMarketplaceTimeline';
import {
  logCustomerTrackingUi,
  resolveCustomerTrackingUi,
} from '@/lib/customerTrackingLog';
import { resolveCustomerDeliveryPhase } from '@/constants/deliveryCustomerExperience';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { orderRoomHref } from '@/services/orderChat';
import type { RestaurantOrder } from '@/services/orderService';
import { showRestaurantAcceptedCancelAlert } from '@/lib/customerOrderCancelAlert';
import { resolveCustomerCancelOrderError } from '@/lib/customerOrderCancelUx';
import {
  customerCancelMarketplaceOrder,
  customerCanCancelMarketplaceOrder,
} from '@/services/orderService';
import { db } from '@/services/firebase';
import {
  formatAddress,
  formatETA,
  formatOrderStatus,
  formatRestaurantName,
} from '@/utils/orderFormatters';
import {
  ROLE_ORDER_UPDATE_ERROR,
  getUserFriendlyError,
  showUserError,
} from '@/services/errors';
import { showError, showNotice } from '@/utils/toast';
import { useCustomerOrderLifecycleAlert } from '@/hooks/useOrderLifecycleAlerts';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import MapRenderer from '@/components/maps';
import { SafeAreaView } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function CustomerOrderDetailsScreen({ order }: { order: RestaurantOrder }) {
  const router = useRouter();
  const [restaurantMeta, setRestaurantMeta] = useState<{
    name: string;
    image: string | null;
    address: string | null;
  }>({ name: 'Unknown restaurant', image: null, address: null });
  const [driverMeta, setDriverMeta] = useState<{ avatar: string | null }>({ avatar: null });
  const [cancelling, setCancelling] = useState(false);
  const [ratePromptVisible, setRatePromptVisible] = useState(false);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [
    order.status,
    order.paymentStatus,
    order.estimatedDeliveryTime,
    order.driverName,
    order.driverLocation?.lat,
  ]);

  useEffect(() => {
    let cancelled = false;
    const restName = formatRestaurantName(order.restaurant?.name);
    const orderRestaurantId = order.restaurantId;
    const orderDriverId = order.driverId;
    const rName = order.restaurant?.name;
    const rImage = order.restaurant?.image;
    const rAddr = order.restaurant?.address;
    const dAvatar = order.driver?.avatar;

    void (async () => {
      const nextRestaurant = {
        name: restName,
        image: rImage ?? null,
        address: rAddr ? formatAddress(rAddr) : null,
      };

      if (
        orderRestaurantId &&
        (nextRestaurant.name === 'Unknown restaurant' || !nextRestaurant.image || !nextRestaurant.address)
      ) {
        try {
          const snap = await getDoc(doc(db, 'restaurants', orderRestaurantId));
          const d = snap.data() as Record<string, unknown> | undefined;
          nextRestaurant.name = formatRestaurantName(d?.name ?? d?.restaurantName ?? restName);
          nextRestaurant.image =
            typeof d?.image === 'string'
              ? d.image
              : typeof d?.logoUrl === 'string'
                ? d.logoUrl
                : typeof d?.photoUrl === 'string'
                  ? d.photoUrl
                  : null;
          nextRestaurant.address =
            typeof d?.address === 'string' ? formatAddress(d.address) : null;
        } catch {
          // keep fallback
        }
      }
      if (!cancelled) setRestaurantMeta(nextRestaurant);

      const nextDriver = { avatar: null as string | null };
      if (dAvatar) {
        nextDriver.avatar = dAvatar;
      } else if (orderDriverId) {
        try {
          const driverSnap = await getDoc(doc(db, 'drivers', orderDriverId));
          const dr = driverSnap.data() as Record<string, unknown> | undefined;
          nextDriver.avatar =
            typeof dr?.avatar === 'string'
              ? dr.avatar
              : typeof dr?.photoURL === 'string'
                ? dr.photoURL
                : null;
        } catch {
          // keep fallback
        }
      }
      if (!cancelled) setDriverMeta(nextDriver);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    order.id,
    order.restaurantId,
    order.driverId,
    order.restaurant?.name,
    order.restaurant?.image,
    order.restaurant?.address,
    order.driver?.avatar,
  ]);

  const trackingUi = useMemo(() => resolveCustomerTrackingUi(order), [
    order.status,
    order.deliveryStatus,
    order.completedAtMs,
    order.deliveredAtMs,
  ]);
  const delivered = trackingUi.delivered;

  useEffect(() => {
    logCustomerTrackingUi(order.id, order, 'CustomerOrderDetailsScreen');
  }, [order, order.deliveryStatus, order.id, order.status]);

  useCustomerOrderLifecycleAlert(order);

  const timelineIndex = useMemo(() => customerMarketplaceTimelineIndex(order), [order]);
  const timelineProgress = useMemo(() => {
    if (delivered) return 1;
    if (timelineIndex < 0) return 0;
    return (timelineIndex + 1) / CUSTOMER_MARKETPLACE_TIMELINE.length;
  }, [timelineIndex, delivered]);

  const customerPhase = useMemo(
    () =>
      resolveCustomerDeliveryPhase({
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryStatus: order.deliveryStatus,
        driverId: order.driverId,
        assignedDriverId: order.assignedDriverId,
        pickedUpAtMs: order.pickedUpAtMs,
        deliveredAtMs: order.deliveredAtMs,
        completedAtMs: order.completedAtMs,
      }),
    [
      order.id,
      order.status,
      order.paymentStatus,
      order.deliveryStatus,
      order.driverId,
      order.assignedDriverId,
      order.pickedUpAtMs,
      order.deliveredAtMs,
      order.completedAtMs,
    ],
  );

  const deliveredAtLabel = useMemo(() => {
    const ms = order.deliveredAtMs ?? order.completedAtMs;
    if (ms == null || !Number.isFinite(ms)) return null;
    return new Date(ms).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [order.completedAtMs, order.deliveredAtMs]);

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

  const mapMarkers = useMemo(() => {
    const out: {
      id: string;
      latitude: number;
      longitude: number;
      title?: string;
      pinColor?: string;
    }[] = [];
    if (order.driverLocation) {
      out.push({
        id: 'driver',
        latitude: order.driverLocation.lat,
        longitude: order.driverLocation.lng,
        title: 'Driver',
        pinColor: '#22C55E',
      });
    }
    if (order.restaurantLocation) {
      out.push({
        id: 'restaurant',
        latitude: order.restaurantLocation.lat,
        longitude: order.restaurantLocation.lng,
        title: 'Restaurant',
        pinColor: '#F59E0B',
      });
    }
    if (order.deliveryLocation) {
      out.push({
        id: 'dropoff',
        latitude: order.deliveryLocation.lat,
        longitude: order.deliveryLocation.lng,
        title: 'Dropoff',
        pinColor: '#38BDF8',
      });
    }
    return out;
  }, [order]);

  const statusChip = chipForFulfillment(
    delivered ? 'completed' : order.status,
  );
  const payChip = paymentBadge(order.paymentStatus);

  const driverChatEnabled =
    ((typeof order.driverId === 'string' && order.driverId.length > 0) ||
      (typeof order.assignedDriverId === 'string' && order.assignedDriverId.length > 0)) &&
    order.paymentStatus === 'paid';

  const cancelAllowed = customerCanCancelMarketplaceOrder({
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    paymentStatus: order.paymentStatus,
  });

  async function onCancel() {
    if (!cancelAllowed || cancelling) return;
    setCancelling(true);
    try {
      await customerCancelMarketplaceOrder(order.id);
      showNotice('Order cancelled', 'Your order was cancelled.');
    } catch (e) {
      const cancelErr = resolveCustomerCancelOrderError(e, {
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        paymentStatus: order.paymentStatus,
      });
      if (cancelErr === 'restaurant_accepted') {
        showRestaurantAcceptedCancelAlert();
      } else {
        showUserError(e, {
          role: 'customer',
          context: 'customer',
          fallback: ROLE_ORDER_UPDATE_ERROR.customer,
        });
      }
    } finally {
      setCancelling(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Track order" />
      <ScrollView
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.stickyHeader}>
          <Text style={styles.orderId}>Live order tracking</Text>
          <Text style={styles.phaseHeadline}>
            {delivered ? 'Order completed' : trackingUi.title}
          </Text>
          <Text style={styles.phaseSubtitle}>
            {delivered
              ? deliveredAtLabel
                ? `Delivered ${deliveredAtLabel}`
                : 'Your order has been delivered.'
              : customerPhase.subtitle}
          </Text>
          {!delivered ? (
            <Pressable
              style={styles.trackFullscreenBtn}
              onPress={() => router.push(`/track-order/${encodeURIComponent(order.id)}` as never)}
            >
              <Text style={styles.trackFullscreenBtnText}>Fullscreen live map</Text>
            </Pressable>
          ) : null}
          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: statusChip.bg }]}>
              <Text style={[styles.chipText, { color: statusChip.fg }]}>
                {delivered
                  ? 'delivered'
                  : (order.status ?? 'pending').replace(/_/g, ' ')}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: payChip.bg }]}>
              <Text style={[styles.chipText, { color: payChip.fg }]}>{payChip.label}</Text>
            </View>
          </View>
          {!delivered ? (
            <>
              <Text style={styles.driverLine}>Driver: {driverStatusLabel(order)}</Text>
              {formatETA(order.estimatedDeliveryTime) ? (
                <View style={styles.etaWrap}>
                  <ETAChip minutes={order.estimatedDeliveryTime} />
                </View>
              ) : null}
              <View style={styles.progressWrap}>
                <DeliveryProgressBar progress={timelineProgress} />
              </View>
            </>
          ) : (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>✓ Delivered</Text>
            </View>
          )}
        </View>

        <OrderPaymentTimeline order={order} variant="dark" />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Restaurant</Text>
          <View style={styles.heroRow}>
            <View style={styles.heroImageWrap}>
              {restaurantMeta.image ? (
                <Image source={{ uri: restaurantMeta.image }} style={styles.heroImage} />
              ) : (
                <View style={styles.heroImageFallback}>
                  <Text style={styles.heroImageFallbackIcon}>🍽️</Text>
                </View>
              )}
            </View>
            <View style={styles.heroBody}>
              <Text style={styles.heroTitle}>{formatRestaurantName(restaurantMeta.name)}</Text>
              <Text style={styles.meta}>{formatAddress(restaurantMeta.address)}</Text>
              <Text style={styles.meta}>{formatOrderStatus(order.status)}</Text>
              {formatETA(order.estimatedDeliveryTime) ? (
                <Text style={styles.etaText}>{formatETA(order.estimatedDeliveryTime)}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {order.deliveryPin && !delivered && order.paymentStatus === 'paid' ? (
          <View style={styles.pinCard}>
            <Text style={styles.pinLabel}>Your delivery PIN</Text>
            <Text style={styles.pinDigits}>{order.deliveryPin}</Text>
            <Text style={styles.pinHint}>Give this code to your driver only at dropoff.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver</Text>
          <View style={styles.heroRow}>
            <View style={styles.avatarWrap}>
              {driverMeta.avatar ? (
                <Image source={{ uri: driverMeta.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>🚗</Text>
                </View>
              )}
            </View>
            <View style={styles.heroBody}>
              <Text style={styles.meta}>
                {order.driver?.name?.trim() || order.driverName?.trim()
                  ? order.driver?.name?.trim() || order.driverName
                  : 'Matching a driver…'}
              </Text>
              {(order.driver?.phone || order.driverPhone) ? (
                <Text
                  style={styles.link}
                  onPress={() =>
                    void Linking.openURL(`tel:${order.driver?.phone || order.driverPhone}`)
                  }
                >
                  Call driver
                </Text>
              ) : (
                <Text style={styles.muted}>Phone unavailable until assigned</Text>
              )}
              {(order.driver?.vehicle || order.driverVehicle) ? (
                <Text style={styles.meta}>
                  Vehicle: {order.driver?.vehicle || order.driverVehicle}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Apple Maps</Text>
          {delivered ? (
            <View style={styles.completedCard}>
              <Text style={styles.completedCardTitle}>Delivery complete</Text>
              <Text style={styles.completedCardBody}>
                {deliveredAtLabel
                  ? `Delivered ${deliveredAtLabel}`
                  : 'Thanks for ordering with us.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.mapHint}>
                {order.status === 'on_the_way' ||
                order.status === 'picked_up' ||
                order.status === 'arrived_customer'
                  ? 'Driver location updates automatically.'
                  : 'Map highlights restaurant and dropoff.'}
              </Text>
              <View style={styles.mapHost}>
                {mapPoints.length > 0 ? (
                  <MapRenderer
                    style={styles.mapReal}
                    initialRegion={{
                      latitude: mapPoints[0].latitude,
                      longitude: mapPoints[0].longitude,
                      latitudeDelta: 0.08,
                      longitudeDelta: 0.08,
                    }}
                    markers={mapMarkers}
                    polylines={
                      mapPoints.length >= 2
                        ? [
                            {
                              id: 'route',
                              coordinates: mapPoints,
                              strokeWidth: 4,
                              strokeColor: '#34D399',
                            },
                          ]
                        : []
                    }
                    webTitle="Apple Maps"
                    webSubtitle="Restaurant → dropoff route"
                  />
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <Text style={styles.muted}>Map preview unavailable</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        <CustomerMarketplaceTimeline order={order} variant="dark" />

        {delivered ? (
          <Pressable style={styles.rateBtn} onPress={() => setRatePromptVisible(true)}>
            <Text style={styles.rateBtnText}>Rate your experience</Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Items</Text>
          {order.items?.length ? (
            order.items.slice(0, 12).map((item) => (
              <View key={`${item.id}-${item.name}`} style={styles.itemRow}>
                <View style={styles.itemImageWrap}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.itemImage} />
                  ) : (
                    <View style={styles.itemImageFallback}>
                      <Text style={styles.itemImageFallbackText}>🍴</Text>
                    </View>
                  )}
                </View>
                <View style={styles.itemBody}>
                  <Text style={styles.itemName}>
                    {item.qty}× {item.name}
                  </Text>
                  <Text style={styles.itemSubtotal}>
                    Subtotal ${(item.price * item.qty).toFixed(2)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No line items</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery details</Text>
          <Text style={styles.metaStrong}>Address</Text>
          <Text style={styles.meta}>{formatAddress(order.deliveryLocation?.address)}</Text>
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
          <Pressable
            style={styles.mapOpenBtn}
            onPress={() =>
              void Linking.openURL(
                `http://maps.apple.com/?q=${encodeURIComponent(formatAddress(order.deliveryLocation?.address))}`,
              )
            }
          >
            <Text style={styles.mapOpenBtnText}>Open in Apple Maps</Text>
          </Pressable>
          <Pressable
            style={styles.reorderBtn}
            onPress={() => router.push('/(tabs)/index' as never)}
          >
            <Text style={styles.reorderBtnText}>Reorder from home</Text>
          </Pressable>

          <Text style={[styles.metaStrong, { marginTop: 18 }]}>Help</Text>
          <Pressable
            style={[styles.secondaryBtn, !driverChatEnabled && styles.secondaryBtnDisabled]}
            disabled={!driverChatEnabled}
            onPress={() =>
              router.push(orderRoomHref(order.id, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never)
            }
          >
            <Text style={styles.secondaryBtnText}>Chat with driver</Text>
          </Pressable>
          {!driverChatEnabled ? (
            <Text style={styles.hint}>Available once a driver is assigned.</Text>
          ) : null}

          <Pressable
            style={[styles.secondaryBtn, { marginTop: 10 }]}
            onPress={() => router.push(orderRoomHref(order.id, ORDER_CHAT_TYPE.SUPPORT) as never)}
          >
            <Text style={styles.secondaryBtnText}>Help & support</Text>
          </Pressable>

          <Pressable
            style={[
              styles.cancelBtn,
              (!cancelAllowed || cancelling) && styles.secondaryBtnDisabled,
            ]}
            disabled={!cancelAllowed || cancelling}
            onPress={() => void onCancel()}
          >
            {cancelling ? (
              <ActivityIndicator color="#FECACA" />
            ) : (
              <Text style={styles.cancelBtnText}>Cancel order</Text>
            )}
          </Pressable>
          {!cancelAllowed ? (
            <Text style={styles.hint}>Cancellation is no longer available for this order.</Text>
          ) : null}
        </View>
      </ScrollView>
      <OrderRatingPrompt
        orderId={order.id}
        visible={ratePromptVisible}
        onDismiss={() => setRatePromptVisible(false)}
      />
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
  phaseHeadline: {
    color: '#F8FAFC',
    fontWeight: '900',
    fontSize: 20,
    paddingHorizontal: 16,
    marginTop: 10,
    letterSpacing: -0.3,
  },
  phaseSubtitle: {
    color: 'rgba(226,232,240,0.72)',
    fontWeight: '600',
    fontSize: 14,
    paddingHorizontal: 16,
    marginTop: 6,
    lineHeight: 20,
  },
  trackFullscreenBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(52, 211, 153, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    alignItems: 'center',
  },
  trackFullscreenBtnText: { color: '#A7F3D0', fontWeight: '900', fontSize: 15 },
  pinCard: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.32)',
  },
  pinLabel: { color: '#FDE68A', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  pinDigits: {
    color: '#FFFBEB',
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: 6,
    marginTop: 8,
  },
  pinHint: { color: 'rgba(254, 243, 199, 0.88)', fontWeight: '600', fontSize: 12, marginTop: 8 },
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
  completedBadge: {
    marginTop: 14,
    marginHorizontal: 16,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  completedBadgeText: { color: '#86EFAC', fontWeight: '900', fontSize: 14 },
  completedCard: {
    borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    padding: 16,
  },
  completedCardTitle: { color: '#86EFAC', fontWeight: '900', fontSize: 18 },
  completedCardBody: { color: '#CBD5E1', marginTop: 8, fontWeight: '600', lineHeight: 20 },
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
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroImageWrap: { width: 66, height: 66, borderRadius: 16, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroImageFallbackIcon: { fontSize: 28 },
  heroBody: { flex: 1 },
  heroTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '800' },
  etaText: { marginTop: 6, color: '#FDE68A', fontWeight: '700', fontSize: 13 },
  avatarWrap: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  avatarFallbackText: { fontSize: 20 },
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
  hint: { color: 'rgba(148,163,184,0.75)', fontSize: 12, marginTop: 6, fontWeight: '600' },
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
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  itemImageWrap: { width: 46, height: 46, borderRadius: 12, overflow: 'hidden' },
  itemImage: { width: '100%', height: '100%' },
  itemImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  itemImageFallbackText: { fontSize: 18 },
  itemBody: { flex: 1 },
  itemName: { color: '#E2E8F0', fontWeight: '700', fontSize: 14 },
  itemSubtotal: { color: 'rgba(148,163,184,0.9)', fontWeight: '600', marginTop: 2 },
  priceBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
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
  mapOpenBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.35)',
    backgroundColor: 'rgba(125,211,252,0.12)',
  },
  mapOpenBtnText: { color: '#7DD3FC', fontWeight: '800', fontSize: 13 },
  reorderBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.45)',
    backgroundColor: 'rgba(52,211,153,0.18)',
  },
  reorderBtnText: { color: '#A7F3D0', fontWeight: '800', fontSize: 13 },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(148,163,184,0.12)',
    alignItems: 'center',
  },
  secondaryBtnDisabled: { opacity: 0.45 },
  secondaryBtnText: { color: '#E2E8F0', fontWeight: '800', fontSize: 14 },
  cancelBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    backgroundColor: 'rgba(248,113,113,0.15)',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#FECACA', fontWeight: '800', fontSize: 15 },
  rateBtn: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#FF3008',
    alignItems: 'center',
  },
  rateBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
});
