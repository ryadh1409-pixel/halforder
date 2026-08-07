/**
 * FoodShareOrderTrackingSection
 *
 * Inline order-tracking content for the HalfOrder match screen.
 * Rendered below the Partner Chat button after both users have paid.
 *
 * Reuses the same components and utility functions as CustomerOrderDetailsScreen
 * — no new tracking logic, only a different layout host (no SafeAreaView / AppHeader).
 */

import { CustomerMarketplaceTimeline } from '@/components/order/CustomerMarketplaceTimeline';
import { DeliveryProgressBar } from '@/components/order/DeliveryProgressBar';
import { ETAChip } from '@/components/order/ETAChip';
import { OrderPaymentTimeline } from '@/components/order/OrderPaymentTimeline';
import { OrderReceiptBreakdown } from '@/components/orders/OrderReceiptBreakdown';
import {
  chipForFulfillment,
  driverStatusLabel,
  paymentBadge,
} from '@/components/orders/shared/marketplaceTrackingParts';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { resolveCustomerDeliveryPhase } from '@/constants/deliveryCustomerExperience';
import {
  CUSTOMER_MARKETPLACE_TIMELINE,
  customerMarketplaceTimelineIndex,
} from '@/lib/customerMarketplaceTimeline';
import { logCustomerTrackingUi, resolveCustomerTrackingUi } from '@/lib/customerTrackingLog';
import { computeOrderPricing } from '@/lib/orderPricing';
import { isIWantOrder } from '@/lib/iWantTimeline';
import { IWantTimeline } from '@/components/iWant/IWantTimeline';
import { db } from '@/services/firebase';
import { orderRoomHref } from '@/services/orderChat';
import { subscribeOrderById, type RestaurantOrder } from '@/services/orderService';
import { hasSubmittedFeedback, submitOrderFeedback } from '@/services/feedback/orderFeedbackService';
import { useAuth } from '@/services/AuthContext';
import {
  formatAddress,
  formatETA,
  formatOrderStatus,
  formatRestaurantName,
} from '@/utils/orderFormatters';
import { formatOrderDateTimeAbsolute } from '@/utils/time';
import { openDeliveryTrackingInGoogleMaps } from '@/lib/maps/openDeliveryTrackingMaps';
import { showError } from '@/utils/toast';
import { OrderFeedbackModal, type OrderFeedbackPayload } from '@/components/feedback/OrderFeedbackModal';
import MapRenderer from '@/components/maps';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function FoodShareOrderTrackingSection({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { user } = useAuth();

  const [order, setOrder] = useState<RestaurantOrder | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);

  const [restaurantMeta, setRestaurantMeta] = useState<{
    name: string;
    image: string | null;
    address: string | null;
  }>({ name: 'Unknown restaurant', image: null, address: null });
  const [driverMeta, setDriverMeta] = useState<{
    avatar: string | null;
    phone: string | null;
  }>({ avatar: null, phone: null });

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  // Subscribe to the order doc
  useEffect(() => {
    if (!orderId) return undefined;
    const unsub = subscribeOrderById(
      orderId,
      (o) => {
        setOrder(o);
        setLoadingOrder(false);
      },
      { onListenError: () => setLoadingOrder(false) },
    );
    return unsub;
  }, [orderId]);

  // Smooth transitions on order status changes
  useEffect(() => {
    if (!order) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [
    order?.status,
    order?.paymentStatus,
    order?.estimatedDeliveryTime,
    order?.driverName,
    order?.driverLocation?.lat,
  ]);

  // Fetch restaurant + driver metadata
  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    const orderRestaurantId = order.restaurantId;
    const orderDriverId =
      (typeof order.driverId === 'string' && order.driverId.trim() ? order.driverId.trim() : null) ||
      (typeof order.assignedDriverId === 'string' && order.assignedDriverId.trim()
        ? order.assignedDriverId.trim()
        : null);

    void (async () => {
      const nextRestaurant = {
        name: formatRestaurantName(order.restaurant?.name),
        image: order.restaurant?.image ?? null,
        address: order.restaurant?.address ? formatAddress(order.restaurant.address) : null,
      };
      if (
        orderRestaurantId &&
        (nextRestaurant.name === 'Unknown restaurant' || !nextRestaurant.image || !nextRestaurant.address)
      ) {
        try {
          const snap = await getDoc(doc(db, 'restaurants', orderRestaurantId));
          const d = snap.data() as Record<string, unknown> | undefined;
          nextRestaurant.name = formatRestaurantName(d?.name ?? d?.restaurantName ?? nextRestaurant.name);
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

      const nextDriver = {
        avatar: order.driver?.avatar ?? null,
        phone:
          (typeof order.driver?.phone === 'string' && order.driver.phone.trim()
            ? order.driver.phone.trim()
            : null) ||
          (typeof order.driverPhone === 'string' && order.driverPhone.trim()
            ? order.driverPhone.trim()
            : null),
      };
      if (orderDriverId) {
        try {
          if (!nextDriver.avatar) {
            const driverSnap = await getDoc(doc(db, 'drivers', orderDriverId));
            const dr = driverSnap.data() as Record<string, unknown> | undefined;
            nextDriver.avatar =
              typeof dr?.avatar === 'string'
                ? dr.avatar
                : typeof dr?.photoURL === 'string'
                  ? dr.photoURL
                  : null;
            if (!nextDriver.phone) {
              nextDriver.phone =
                (typeof dr?.phone === 'string' && dr.phone.trim() ? dr.phone.trim() : null) ||
                (typeof dr?.phoneNumber === 'string' && dr.phoneNumber.trim()
                  ? dr.phoneNumber.trim()
                  : null);
            }
          } else if (!nextDriver.phone) {
            const driverSnap = await getDoc(doc(db, 'drivers', orderDriverId));
            const dr = driverSnap.data() as Record<string, unknown> | undefined;
            nextDriver.phone =
              (typeof dr?.phone === 'string' && dr.phone.trim() ? dr.phone.trim() : null) ||
              (typeof dr?.phoneNumber === 'string' && dr.phoneNumber.trim()
                ? dr.phoneNumber.trim()
                : null);
          }
        } catch {
          // keep fallback
        }
        if (!nextDriver.phone) {
          try {
            const userSnap = await getDoc(doc(db, 'users', orderDriverId));
            const u = userSnap.data() as Record<string, unknown> | undefined;
            nextDriver.phone =
              (typeof u?.phone === 'string' && u.phone.trim() ? u.phone.trim() : null) ||
              (typeof u?.phoneNumber === 'string' && u.phoneNumber.trim()
                ? u.phoneNumber.trim()
                : null) ||
              (typeof u?.whatsapp === 'string' && u.whatsapp.trim()
                ? u.whatsapp.trim()
                : null);
          } catch {
            // keep fallback
          }
        }
      }
      if (!cancelled) setDriverMeta(nextDriver);
    })();

    return () => { cancelled = true; };
  }, [
    order?.id,
    order?.restaurantId,
    order?.driverId,
    order?.assignedDriverId,
    order?.driverPhone,
    order?.restaurant?.name,
    order?.restaurant?.image,
    order?.restaurant?.address,
    order?.driver?.avatar,
    order?.driver?.phone,
  ]);

  const trackingUi = useMemo(
    () => (order ? resolveCustomerTrackingUi(order) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order?.status, order?.deliveryStatus, order?.completedAtMs, order?.deliveredAtMs],
  );
  const delivered = trackingUi?.delivered ?? false;

  useEffect(() => {
    if (order) logCustomerTrackingUi(order.id, order, 'FoodShareOrderTrackingSection');
  }, [order, order?.deliveryStatus, order?.id, order?.status]);

  // Rating check
  useEffect(() => {
    if (!user || !delivered || !order) return;
    hasSubmittedFeedback(order.id, user.uid).then(setAlreadyRated).catch(() => {});
  }, [user, order?.id, delivered]);

  const timelineIndex = useMemo(
    () => (order ? customerMarketplaceTimelineIndex(order) : -1),
    [order],
  );
  const timelineProgress = useMemo(() => {
    if (delivered) return 1;
    if (timelineIndex < 0) return 0;
    return (timelineIndex + 1) / CUSTOMER_MARKETPLACE_TIMELINE.length;
  }, [timelineIndex, delivered]);

  const customerPhase = useMemo(
    () =>
      order
        ? resolveCustomerDeliveryPhase({
            id: order.id,
            status: order.status,
            paymentStatus: order.paymentStatus,
            deliveryStatus: order.deliveryStatus,
            driverId: order.driverId,
            assignedDriverId: order.assignedDriverId,
            pickedUpAtMs: order.pickedUpAtMs,
            deliveredAtMs: order.deliveredAtMs,
            completedAtMs: order.completedAtMs,
          })
        : null,
    [
      order?.id,
      order?.status,
      order?.paymentStatus,
      order?.deliveryStatus,
      order?.driverId,
      order?.assignedDriverId,
      order?.pickedUpAtMs,
      order?.deliveredAtMs,
      order?.completedAtMs,
    ],
  );

  const deliveredAtLabel = useMemo(() => {
    const ms = order?.deliveredAtMs ?? order?.completedAtMs;
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
    const label = formatOrderDateTimeAbsolute(ms);
    return label === '—' ? null : label;
  }, [order?.completedAtMs, order?.deliveredAtMs]);

  const mapPoints = useMemo(() => {
    if (!order) return [];
    return [
      order.driverLocation
        ? { latitude: order.driverLocation.lat, longitude: order.driverLocation.lng }
        : null,
      order.restaurantLocation
        ? { latitude: order.restaurantLocation.lat, longitude: order.restaurantLocation.lng }
        : null,
      order.deliveryLocation
        ? { latitude: order.deliveryLocation.lat, longitude: order.deliveryLocation.lng }
        : null,
    ].filter((p): p is { latitude: number; longitude: number } => Boolean(p));
  }, [order]);

  const previewCenter = useMemo(() => {
    if (!order) return null;
    if (order.restaurantLocation && Number.isFinite(order.restaurantLocation.lat)) {
      return { latitude: order.restaurantLocation.lat, longitude: order.restaurantLocation.lng };
    }
    if (order.deliveryLocation && Number.isFinite(order.deliveryLocation.lat)) {
      return { latitude: order.deliveryLocation.lat, longitude: order.deliveryLocation.lng };
    }
    if (order.driverLocation && Number.isFinite(order.driverLocation.lat)) {
      return { latitude: order.driverLocation.lat, longitude: order.driverLocation.lng };
    }
    return null;
  }, [order?.restaurantLocation, order?.deliveryLocation, order?.driverLocation]);

  const previewMarkers = useMemo(() => {
    if (!order) return [];
    const out: {
      id: string;
      latitude: number;
      longitude: number;
      title?: string;
      pinColor?: string;
      variant?: 'driver' | 'destination' | 'default';
    }[] = [];
    if (order.deliveryLocation) {
      out.push({
        id: 'destination',
        latitude: order.deliveryLocation.lat,
        longitude: order.deliveryLocation.lng,
        title: 'Destination',
        variant: 'destination',
      });
    } else if (order.restaurantLocation) {
      out.push({
        id: 'destination',
        latitude: order.restaurantLocation.lat,
        longitude: order.restaurantLocation.lng,
        title: 'Restaurant',
        variant: 'destination',
      });
    }
    if (order.restaurantLocation && order.deliveryLocation) {
      out.push({
        id: 'restaurant',
        latitude: order.restaurantLocation.lat,
        longitude: order.restaurantLocation.lng,
        title: 'Restaurant',
        pinColor: '#F59E0B',
      });
    }
    if (order.driverLocation) {
      out.push({
        id: 'driver',
        latitude: order.driverLocation.lat,
        longitude: order.driverLocation.lng,
        title: 'Driver',
        variant: 'driver',
      });
    }
    return out;
  }, [order?.deliveryLocation, order?.restaurantLocation, order?.driverLocation]);

  const statusChip = order ? chipForFulfillment(delivered ? 'completed' : order.status) : null;
  const payChip = order ? paymentBadge(order.paymentStatus) : null;

  async function handleFeedbackSubmit(payload: OrderFeedbackPayload) {
    if (!user || !order) return;
    await submitOrderFeedback(order.id, user.uid, restaurantMeta.name, payload, 'fullorder');
    setAlreadyRated(true);
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loadingOrder) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color="#C084FC" />
        <Text style={styles.loadingText}>Connecting to order…</Text>
      </View>
    );
  }

  // ── Waiting state: order not yet created (e.g. only one participant paid) ──
  if (!order) {
    return (
      <View style={styles.waitingBox}>
        <Text style={styles.waitingTitle}>Preparing Your Order</Text>
        <Text style={styles.waitingBody}>
          We're getting everything ready for your delivery. Your meal will be
          freshly prepared shortly before delivery to ensure the best quality.
        </Text>
        <Text style={styles.waitingWindowHeading}>Delivery Window</Text>
        <Text style={styles.waitingWindowBody}>
          {'• Before 1:00 PM → 11:00 AM – 1:00 PM\n'}
          {'• 1:00 PM – 6:30 PM → 5:00 PM – 7:00 PM\n'}
          {'• After 6:30 PM → Next day, 11:00 AM – 1:00 PM'}
        </Text>
        <ActivityIndicator
          size="small"
          color="#C084FC"
          style={styles.waitingSpinner}
        />
        <Text style={styles.waitingFooter}>
          Delivery tracking will appear automatically once your order is ready.
        </Text>
      </View>
    );
  }

  // ── Render tracking sections ───────────────────────────────────────────────
  return (
    <View>
      {/* ── Tracking status header ── */}
      <View style={styles.trackingHeader}>
        <Text style={styles.trackingKicker}>Live order tracking</Text>
        <Text style={styles.trackingTitle}>
          {delivered ? 'Order completed' : (trackingUi?.title ?? 'Tracking your order')}
        </Text>
        <Text style={styles.trackingSubtitle}>
          {delivered
            ? deliveredAtLabel
              ? `Delivered ${deliveredAtLabel}`
              : 'Your order has been delivered.'
            : (customerPhase?.subtitle ?? '')}
        </Text>

        {!delivered ? (
          <>
            <Pressable
              style={styles.fullscreenBtn}
              onPress={() => router.push(`/track-order/${encodeURIComponent(order.id)}` as never)}
            >
              <Text style={styles.fullscreenBtnText}>Fullscreen live map</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/track-order/${encodeURIComponent(order.id)}` as never)}
              style={styles.mapCard}
            >
              <View style={styles.mapHost} pointerEvents="none">
                {previewCenter ? (
                  <MapRenderer
                    style={styles.mapPreview}
                    userInterfaceStyle="dark"
                    initialRegion={{
                      latitude: previewCenter.latitude,
                      longitude: previewCenter.longitude,
                      latitudeDelta: 0.045,
                      longitudeDelta: 0.045,
                    }}
                    markers={previewMarkers}
                    fitToCoordinates={mapPoints.length >= 2 ? mapPoints : undefined}
                    fitEdgePadding={{ top: 36, right: 28, bottom: 36, left: 28 }}
                    webTitle="Live map"
                    webSubtitle="Tap for fullscreen tracking"
                  />
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <Text style={styles.mapPlaceholderText}>Map preview unavailable</Text>
                  </View>
                )}
              </View>
            </Pressable>
          </>
        ) : null}

        {statusChip ? (
          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: statusChip.bg }]}>
              <Text style={[styles.chipText, { color: statusChip.fg }]}>
                {delivered ? 'delivered' : (order.status ?? 'pending').replace(/_/g, ' ')}
              </Text>
            </View>
            {payChip && order.paymentStatus !== 'paid' ? (
              <View style={[styles.chip, { backgroundColor: payChip.bg }]}>
                <Text style={[styles.chipText, { color: payChip.fg }]}>{payChip.label}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

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
          <>
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>✓ Delivered</Text>
            </View>
            {alreadyRated ? (
              <Text style={styles.alreadyRatedText}>⭐ You've already rated this order</Text>
            ) : (
              <Pressable style={styles.feedbackBtn} onPress={() => setFeedbackOpen(true)}>
                <Text style={styles.feedbackBtnText}>⭐ Rate Your Experience</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* ── Order payment timeline ── */}
      <OrderPaymentTimeline order={order} variant="dark" />

      {/* ── Restaurant card ── */}
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

      {/* ── Driver card ── */}
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
            {driverMeta.phone || order.driver?.phone || order.driverPhone ? (
              <Text
                style={styles.link}
                onPress={() =>
                  void Linking.openURL(
                    `tel:${driverMeta.phone || order.driver?.phone || order.driverPhone}`,
                  )
                }
              >
                {driverMeta.phone || order.driver?.phone || order.driverPhone}
              </Text>
            ) : order.driverId || order.assignedDriverId ? (
              <Text style={styles.muted}>Phone unavailable</Text>
            ) : (
              <Text style={styles.muted}>Phone unavailable until assigned</Text>
            )}
            {order.driver?.vehicle || order.driverVehicle ? (
              <Text style={styles.meta}>
                Vehicle: {order.driver?.vehicle || order.driverVehicle}
              </Text>
            ) : null}
          </View>
        </View>
        {(order.driverId || order.assignedDriverId) && order.paymentStatus === 'paid' ? (
          <Pressable
            style={styles.driverChatBtn}
            onPress={() =>
              router.push(orderRoomHref(order.id, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never)
            }
          >
            <Text style={styles.driverChatBtnText}>Chat with driver</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Delivery timeline ── */}
      {isIWantOrder(order) ? (
        <IWantTimeline order={order} variant="dark" />
      ) : (
        <CustomerMarketplaceTimeline order={order} variant="dark" />
      )}

      {/* ── Receipt ── */}
      <View style={[styles.card, styles.receiptCard]}>
        <Text style={styles.receiptTitle}>Order Receipt</Text>
        {order.deliveryLocation ? (
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Delivery address</Text>
            <Text style={styles.addressValue}>
              {formatAddress(order.deliveryLocation.address)}
            </Text>
          </View>
        ) : null}
        <OrderReceiptBreakdown
          tone="dark"
          title="Order Summary"
          pricing={computeOrderPricing({
            foodSubtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            serviceFee: order.serviceFee,
            promoDiscount: order.promoDiscount,
            taxRate: order.taxRate,
          })}
          meta={{
            receiptNumber: order.receiptNumber,
            idForReceipt: order.id,
            paymentMethod: order.paymentMethod ?? 'Card',
            paymentStatus: order.paymentStatus,
            paidAt: order.paidAt,
          }}
        />
        <Pressable
          style={styles.mapsBtn}
          onPress={() => {
            void (async () => {
              const restaurant = order.restaurantLocation
                ? {
                    latitude: order.restaurantLocation.lat,
                    longitude: order.restaurantLocation.lng,
                    label: order.restaurant?.name ?? 'Restaurant',
                  }
                : null;
              const customerLoc =
                order.deliveryLocation ?? order.customerLocation ?? order.userLocation;
              const customer =
                customerLoc && Number.isFinite(customerLoc.lat) && Number.isFinite(customerLoc.lng)
                  ? {
                      latitude: customerLoc.lat,
                      longitude: customerLoc.lng,
                      label:
                        ('address' in customerLoc &&
                        typeof customerLoc.address === 'string' &&
                        customerLoc.address.trim()
                          ? customerLoc.address
                          : null) ||
                        order.deliveryLocation?.address ||
                        'Delivery address',
                    }
                  : null;
              const driver =
                order.driverLocation &&
                Number.isFinite(order.driverLocation.lat) &&
                Number.isFinite(order.driverLocation.lng)
                  ? {
                      latitude: order.driverLocation.lat,
                      longitude: order.driverLocation.lng,
                      label: 'Driver',
                    }
                  : null;
              if (!restaurant && !customer) {
                showError('Location unavailable');
                return;
              }
              const opened = await openDeliveryTrackingInGoogleMaps({ restaurant, driver, customer });
              if (!opened) showError('Could not open Google Maps');
            })();
          }}
        >
          <Text style={styles.mapsBtnText}>View delivery location</Text>
        </Pressable>
      </View>

      <OrderFeedbackModal
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={handleFeedbackSubmit}
        isPickup={(order as unknown as { fulfillmentMode?: string }).fulfillmentMode === 'pickup'}
        restaurantName={restaurantMeta.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    marginTop: 20,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  loadingText: { color: '#7D8493', fontSize: 14, fontWeight: '600' },
  waitingBox: {
    marginTop: 20,
    padding: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  waitingTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
  waitingBody: { fontSize: 13, lineHeight: 20, color: 'rgba(255,255,255,0.6)' },
  waitingWindowHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
    marginBottom: 2,
  },
  waitingWindowBody: { fontSize: 12, lineHeight: 20, color: 'rgba(255,255,255,0.6)' },
  waitingSpinner: { marginTop: 10, alignSelf: 'center' },
  waitingFooter: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: 2,
    fontStyle: 'italic',
  },
  trackingHeader: {
    marginTop: 16,
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  trackingKicker: { color: '#7D8493', fontWeight: '700', fontSize: 12 },
  trackingTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 20,
    marginTop: 8,
    letterSpacing: -0.3,
  },
  trackingSubtitle: {
    color: '#B7BDC9',
    fontWeight: '600',
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  fullscreenBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(168,85,247,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    alignItems: 'center',
  },
  fullscreenBtnText: { color: '#C084FC', fontWeight: '900', fontSize: 15 },
  mapCard: {
    marginTop: 12,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0E1218',
  },
  mapHost: { height: 180, width: '100%', borderRadius: 18, overflow: 'hidden' },
  mapPreview: { ...StyleSheet.absoluteFillObject },
  mapPlaceholder: {
    height: 180,
    width: '100%',
    backgroundColor: '#151126',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: { color: 'rgba(148,163,184,0.85)', fontWeight: '600', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontWeight: '800', fontSize: 12, textTransform: 'capitalize' },
  driverLine: { marginTop: 12, color: 'rgba(226,232,240,0.85)', fontWeight: '600', fontSize: 13 },
  etaWrap: { marginTop: 12 },
  progressWrap: { marginTop: 14 },
  completedBadge: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  completedBadgeText: { color: '#86EFAC', fontWeight: '900', fontSize: 14 },
  feedbackBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.4)',
    alignItems: 'center',
  },
  feedbackBtnText: { color: '#C084FC', fontWeight: '900', fontSize: 15 },
  alreadyRatedText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#FBBF24',
    textAlign: 'center',
  },
  card: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0E1218',
    padding: 16,
  },
  receiptCard: { padding: 18 },
  receiptTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 14,
  },
  addressBlock: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  addressLabel: {
    color: '#8B929E',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  addressValue: {
    color: 'rgba(226,232,240,0.92)',
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 22,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
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
  heroTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
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
  etaText: { marginTop: 6, color: '#F59E0B', fontWeight: '700', fontSize: 13 },
  muted: { color: 'rgba(148,163,184,0.85)', marginTop: 4, fontWeight: '600', fontSize: 13 },
  link: { color: '#7DD3FC', fontWeight: '800', marginTop: 8, fontSize: 15 },
  driverChatBtn: {
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(125,132,147,0.16)',
    alignItems: 'center',
  },
  driverChatBtnText: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 14 },
  mapsBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.35)',
    backgroundColor: 'rgba(125,211,252,0.12)',
  },
  mapsBtnText: { color: '#7DD3FC', fontWeight: '800', fontSize: 13 },
});
