/**
 * DoorDash-style customer live order tracking (light theme).
 * Route: /track-order/[orderId]
 */
import { PaymentNavigationBoundary } from '@/components/payment/PaymentNavigationBoundary';
import { DriverVehicleInfoCard } from '@/components/delivery/DriverVehicleInfoCard';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { EMPTY_DRIVER_VEHICLE, type DriverVehicleInfo } from '@/lib/driverVehicle';
import { logPaymentNavigation } from '@/lib/paymentNavigation';
import { logPaidStatusRepairIfNeeded } from '@/services/paymentFlowFirestore';
import { CustomerTrackingMap } from '@/components/maps/CustomerTrackingMap';
import { CustomerMarketplaceTimeline } from '@/components/order/CustomerMarketplaceTimeline';
import { IWantTimeline } from '@/components/iWant/IWantTimeline';
import { isIWantOrder } from '@/lib/iWantTimeline';
import { logCustomerRawDoc } from '@/lib/customerOrderSnapshotLog';
import {
  logCustomerTrackingUi,
  resolveCustomerTrackingUi,
} from '@/lib/customerTrackingLog';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { orderRoomHref } from '@/services/orderChat';
import {
  looksLikeMarketplaceRestaurantOrder,
  subscribeCustomerOrderById,
  type RestaurantOrder,
} from '@/services/orderService';
import { useCustomerOrderLifecycleAlert } from '@/hooks/useOrderLifecycleAlerts';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
import { toMapCoordinate } from '@/lib/location/coordinates';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const WINDOW_H = Dimensions.get('window').height;
const MAP_HEIGHT = Math.round(WINDOW_H * 0.62);

function vehicleFromOrder(order: RestaurantOrder): DriverVehicleInfo {
  const d = order.driver;
  const info: DriverVehicleInfo = {
    vehiclePhoto: d?.vehiclePhoto ?? null,
    vehicleMake: d?.vehicleMake ?? null,
    vehicleModel: d?.vehicleModel ?? null,
    vehicleYear: d?.vehicleYear ?? null,
    vehicleColor: d?.vehicleColor ?? null,
    licensePlate: d?.licensePlate ?? null,
  };
  if (!info.vehicleMake && !info.vehicleModel) {
    const legacy = (d?.vehicle || order.driverVehicle || '').trim();
    if (legacy) info.vehicleMake = legacy;
  }
  return info;
}

function driverFirstName(order: RestaurantOrder): string {
  const full = order.driver?.name?.trim() || order.driverName?.trim() || '';
  if (!full) return 'Matching a driver…';
  return full.split(/\s+/)[0] || full;
}

function formatLiveEtaDistance(
  distanceKm: number | null,
  etaMinutes: number | null,
  fallbackEta: number | null,
): { primary: string; secondary: string } {
  const km =
    distanceKm != null && Number.isFinite(distanceKm)
      ? distanceKm < 0.1
        ? '< 0.1 km'
        : `${distanceKm.toFixed(1)} km`
      : null;
  const mins =
    etaMinutes != null && Number.isFinite(etaMinutes) && etaMinutes > 0
      ? Math.round(etaMinutes)
      : fallbackEta != null && fallbackEta > 0 && fallbackEta < 180
        ? Math.round(fallbackEta)
        : null;
  if (km && mins != null) {
    return { primary: `${km}`, secondary: `${mins} min` };
  }
  if (mins != null) {
    return { primary: `${mins} min`, secondary: 'Updating distance…' };
  }
  if (km) {
    return { primary: km, secondary: 'Updating ETA…' };
  }
  return { primary: 'Updating estimate…', secondary: '' };
}

function TrackingMap({
  order,
  routeCoordinates,
  e2eCapture,
  e2ePhase,
}: {
  order: RestaurantOrder;
  routeCoordinates: { latitude: number; longitude: number }[];
  e2eCapture?: boolean;
  e2ePhase?: string;
}) {
  return (
    <CustomerTrackingMap
      order={order}
      routeCoordinates={routeCoordinates}
      e2eCapture={e2eCapture}
      e2ePhase={e2ePhase}
    />
  );
}

function TrackOrderScreen() {
  const insets = useSafeAreaInsets();
  const { orderId: rawId, e2eCapture: rawCapture, e2ePhase: rawPhase } = useLocalSearchParams<{
    orderId?: string | string[];
    e2eCapture?: string | string[];
    e2ePhase?: string | string[];
  }>();
  const orderId = useMemo(() => {
    const v = Array.isArray(rawId) ? rawId[0] : rawId;
    return typeof v === 'string' ? v.trim() : '';
  }, [rawId]);
  const e2eCapture = useMemo(() => {
    const v = Array.isArray(rawCapture) ? rawCapture[0] : rawCapture;
    return v === '1' || v === 'true';
  }, [rawCapture]);
  const e2ePhase = useMemo(() => {
    const v = Array.isArray(rawPhase) ? rawPhase[0] : rawPhase;
    return typeof v === 'string' ? v : undefined;
  }, [rawPhase]);

  const [order, setOrder] = useState<RestaurantOrder | null | undefined>(undefined);
  const [listenError, setListenError] = useState(false);

  useEffect(() => {
    logPaymentNavigation('track_order_mount', { orderId });
    return () => {
      logPaymentNavigation('track_order_unmount', { orderId });
    };
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setListenError(false);
      return undefined;
    }
    setListenError(false);
    setOrder(undefined);

    const unsubscribe = subscribeCustomerOrderById(
      orderId,
      (mapped) => {
        if (!mapped) {
          setListenError(false);
          setOrder(null);
          return;
        }
        setListenError(false);
        setOrder(mapped);
        logPaidStatusRepairIfNeeded(orderId, {
          paymentStatus: mapped.paymentStatus,
          status: mapped.status,
        });
        logPaymentNavigation('track_order_snapshot', {
          orderId,
          paymentStatus: mapped.paymentStatus,
          status: mapped.status,
          deliveryStatus: mapped.deliveryStatus,
          updatedAtMs: mapped.updatedAtMs,
          driverLat: mapped.driverLocation?.lat ?? null,
          driverLng: mapped.driverLocation?.lng ?? null,
          driverHeading: mapped.driverLocation?.heading ?? null,
        });
      },
      {
        onListenError: (err) => {
          setListenError(true);
          setOrder(null);
          logPaymentNavigation('track_order_listen_error', {
            orderId,
            error: err.message,
          });
        },
      },
    );
    return () => unsubscribe();
  }, [orderId]);

  useCustomerOrderLifecycleAlert(order ?? null);

  const trackingUi = useMemo(
    () => (order ? resolveCustomerTrackingUi(order) : null),
    [order?.status, order?.deliveryStatus, order?.completedAtMs, order?.deliveredAtMs, order],
  );

  useEffect(() => {
    if (!orderId || !order) return;
    logCustomerRawDoc(
      orderId,
      {
        deliveryStatus: order.deliveryStatus,
        status: order.status,
        updatedAt: null,
        updatedAtMs: order.updatedAtMs,
      },
      'track-order-render',
    );
    logCustomerTrackingUi(orderId, order, 'track-order');
  }, [order, orderId, order?.status, order?.deliveryStatus]);

  const deliveredAtLabel = useMemo(() => {
    if (!order) return null;
    const ms = order.deliveredAtMs ?? order.completedAtMs;
    if (ms == null || !Number.isFinite(ms)) return null;
    return new Date(ms).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [order?.deliveredAtMs, order?.completedAtMs]);

  const delivered = trackingUi?.delivered ?? false;

  const restaurantCoord = order ? toMapCoordinate(order.restaurantLocation) : null;
  const customerCoord = order
    ? toMapCoordinate(order.customerLocation) ??
      toMapCoordinate(order.deliveryLocation) ??
      toMapCoordinate(order.userLocation)
    : null;
  const driverCoord =
    order?.driverLocation != null ? toMapCoordinate(order.driverLocation) : null;

  const liveRoute = useLiveDeliveryRoute({
    restaurant: restaurantCoord,
    driver: driverCoord,
    customer: customerCoord,
    enabled: !!order && !delivered,
  });

  const etaDisplay = useMemo(() => {
    if (!order) return { primary: '', secondary: '' };
    if (
      delivered ||
      order.status === 'delivered' ||
      order.status === 'completed' ||
      order.deliveryStatus === 'delivered'
    ) {
      return { primary: 'Delivered!', secondary: '' };
    }
    const fallback =
      typeof order.estimatedDeliveryTime === 'number'
        ? order.estimatedDeliveryTime
        : null;
    return formatLiveEtaDistance(
      liveRoute.distanceKm,
      liveRoute.etaMinutes,
      fallback,
    );
  }, [
    order,
    delivered,
    liveRoute.distanceKm,
    liveRoute.etaMinutes,
    order?.estimatedDeliveryTime,
    order?.status,
    order?.deliveryStatus,
  ]);

  const driverChatEnabled =
    !!order &&
    (
      (typeof order.driverId === 'string' && order.driverId.length > 0) ||
      (typeof order.assignedDriverId === 'string' && order.assignedDriverId.length > 0)
    ) &&
    order.paymentStatus === 'paid';

  const onClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orders' as never);
  }, []);

  const onHelp = useCallback(() => {
    Alert.alert('Help', 'Support is coming soon. For urgent issues, use Help from your profile.');
  }, []);

  if (!orderId) {
    return (
      <SafeAreaView style={styles.lightRoot} edges={['top']}>
        <Text style={styles.errorText}>Invalid link</Text>
        <Pressable onPress={onClose} style={styles.textBtn}>
          <Text style={styles.textBtnLabel}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (order === undefined) {
    return (
      <SafeAreaView style={styles.lightRoot} edges={['top']}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#FF3008" />
          <Text style={styles.loadingCaption}>Loading your order…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (listenError || !order || !looksLikeMarketplaceRestaurantOrder(order)) {
    return (
      <SafeAreaView style={styles.lightRoot} edges={['top']}>
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>
            {listenError
              ? 'We couldn’t sync this order yet. Check your connection and try again.'
              : 'We couldn’t load this delivery yet.'}
          </Text>
          <Pressable
            onPress={() => {
              logPaymentNavigation('track_order_fallback_order_details', { orderId });
              router.replace(USER_ROUTES.order(orderId) as never);
            }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Open order details</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screenRoot}>
      {!delivered ? (
        <View style={[styles.mapSection, { height: MAP_HEIGHT }]}>
          <TrackingMap
            order={order}
            routeCoordinates={liveRoute.coordinates}
            e2eCapture={e2eCapture}
            e2ePhase={e2ePhase}
          />

          <SafeAreaView edges={['top']} style={styles.mapOverlay}>
            <View style={styles.mapTopRow}>
              <Pressable onPress={onClose} style={styles.circleBtnLight} accessibilityLabel="Close">
                <Text style={styles.circleBtnX}>✕</Text>
              </Pressable>
              <Pressable onPress={onHelp} style={styles.helpPill}>
                <Text style={styles.helpPillText}>Help</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      ) : (
        <SafeAreaView edges={['top']} style={styles.completedHeader}>
          <View style={styles.mapTopRow}>
            <Pressable onPress={onClose} style={styles.circleBtnLight} accessibilityLabel="Close">
              <Text style={styles.circleBtnX}>✕</Text>
            </Pressable>
            <Pressable onPress={onHelp} style={styles.helpPill}>
              <Text style={styles.helpPillText}>Help</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}

      <View
        style={[
          styles.sheet,
          {
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: Math.max(20, insets.bottom + 12),
          },
        ]}
      >
        <View style={styles.sheetGrab} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>
              {delivered ? 'Order completed' : (trackingUi?.title ?? 'Order update')}
            </Text>
            <Text style={styles.statusSubtitle}>
              {delivered
                ? deliveredAtLabel
                  ? `Delivered ${deliveredAtLabel}`
                  : 'Your order has been delivered.'
                : (trackingUi?.displayStatus ?? 'We’ll keep this page updated in real time.')}
            </Text>
            {!delivered ? (
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round((trackingUi?.progress ?? 0.1) * 100)}%` },
                  ]}
                />
              </View>
            ) : (
              <View style={styles.completedBadge}>
                <Text style={styles.completedBadgeText}>✓ Delivered</Text>
              </View>
            )}
          </View>

          {isIWantOrder(order) ? (
            <IWantTimeline order={order} variant="light" />
          ) : (
            <CustomerMarketplaceTimeline order={order} variant="light" />
          )}

          {!delivered ? (
            <View style={styles.etaCard}>
              <Text style={styles.etaLabel}>Estimated arrival</Text>
              <View style={styles.etaRow}>
                <Text style={styles.etaValue}>{etaDisplay.primary}</Text>
                {etaDisplay.secondary ? (
                  <Text style={styles.etaSecondary}>{etaDisplay.secondary}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {!delivered ? (
            <>
              <DriverVehicleInfoCard
                driverName={driverFirstName(order)}
                driverPhotoURL={order.driver?.avatar}
                rating={order.driver?.rating ?? null}
                vehicle={
                  order.driverId || order.assignedDriverId
                    ? vehicleFromOrder(order)
                    : { ...EMPTY_DRIVER_VEHICLE }
                }
                dark
              />
              <View style={[styles.card, { marginTop: -4 }]}>
                <View style={styles.actionRow}>
                  <Pressable
                    style={[
                      styles.outlineBtn,
                      !driverChatEnabled && styles.outlineBtnDisabled,
                    ]}
                    disabled={!driverChatEnabled}
                    onPress={() =>
                      router.push(
                        orderRoomHref(
                          order.id,
                          ORDER_CHAT_TYPE.CUSTOMER_DRIVER,
                        ) as never,
                      )
                    }
                  >
                    <Text style={styles.outlineBtnText}>Message Driver</Text>
                  </Pressable>
                  {order.driverPhone || order.driver?.phone ? (
                    <Pressable
                      style={styles.outlineBtn}
                      onPress={() =>
                        void Linking.openURL(
                          `tel:${order.driver?.phone || order.driverPhone}`,
                        )
                      }
                    >
                      <Text style={styles.outlineBtnText}>Call Driver</Text>
                    </Pressable>
                  ) : (
                    <View style={[styles.outlineBtn, styles.outlineBtnDisabled]}>
                      <Text style={styles.outlineBtnMuted}>Call Driver</Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          ) : null}

          {order.deliveryPin && !delivered && order.paymentStatus === 'paid' ? (
            <View style={styles.pinBanner}>
              <Text style={styles.pinBannerLabel}>Show PIN at dropoff</Text>
              <Text style={styles.pinBannerDigits}>{order.deliveryPin}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardHeading}>Order summary</Text>
            {order.items?.length ? (
              order.items.slice(0, 20).map((it) => (
                <View key={`${it.id}-${it.name}`} style={styles.itemRow}>
                  <Text style={styles.itemQty}>{it.qty}×</Text>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {it.name}
                  </Text>
                  <Text style={styles.itemPrice}>${(it.price * it.qty).toFixed(2)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No line items</Text>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${order.totalPrice.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeading}>Addresses</Text>
            <Text style={styles.addrLabel}>Restaurant</Text>
            <Text style={styles.addrValue}>{order.restaurant?.name?.trim() || 'Restaurant'}</Text>
            <Text style={styles.addrSub}>{order.restaurant?.address || '—'}</Text>
            <Text style={[styles.addrLabel, { marginTop: 14 }]}>Deliver to</Text>
            <Text style={styles.addrValue}>{order.deliveryLocation?.address || '—'}</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: '#0B0816' },
  completedHeader: {
    backgroundColor: '#0B0816',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  lightRoot: { flex: 1, backgroundColor: '#0B0816', padding: 24 },
  mapSection: {
    width: '100%',
    backgroundColor: '#E8EEF4',
    overflow: 'hidden',
  },
  mapOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    pointerEvents: 'box-none',
  },
  mapTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  circleBtnLight: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0B0816',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  circleBtnX: { fontSize: 18, color: '#FFFFFF', fontWeight: '700' },
  helpPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#0B0816',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  helpPillText: { fontWeight: '800', color: '#FFFFFF', fontSize: 15 },
  sheet: {
    flex: 1,
    backgroundColor: '#0B0816',
    marginTop: -18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetScroll: { paddingHorizontal: 20, paddingBottom: 32 },
  statusBlock: { marginBottom: 16 },
  statusTitle: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  statusSubtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '600',
    lineHeight: 22,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#A855F7', borderRadius: 2 },
  completedBadge: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  completedBadgeText: { color: '#166534', fontWeight: '900', fontSize: 14 },
  etaCard: {
    backgroundColor: '#151126',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  etaLabel: { fontSize: 12, fontWeight: '800', color: '#7D8493', textTransform: 'uppercase' },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  etaValue: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  etaSecondary: { fontSize: 20, fontWeight: '800', color: '#C4B5FD' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#0B0816',
  },
  cardHeading: { fontSize: 13, fontWeight: '800', color: '#7D8493', marginBottom: 12, textTransform: 'uppercase' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#151126',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarImg: { width: '100%', height: '100%' },
  driverAvatarPlaceholder: { fontSize: 28 },
  driverName: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  driverMeta: { fontSize: 14, color: '#4B5563', fontWeight: '600', marginTop: 4 },
  driverRating: { fontSize: 13, color: '#7D8493', fontWeight: '600', marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  outlineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    backgroundColor: '#0B0816',
  },
  outlineBtnDisabled: { opacity: 0.45 },
  outlineBtnText: { fontWeight: '900', fontSize: 14, color: '#FFFFFF' },
  outlineBtnMuted: { fontWeight: '800', fontSize: 14, color: '#7D8493' },
  pinBanner: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: '#C084FC',
    marginBottom: 14,
  },
  pinBannerLabel: { fontSize: 12, fontWeight: '800', color: '#9A3412', textTransform: 'uppercase' },
  pinBannerDigits: {
    fontSize: 32,
    fontWeight: '900',
    color: '#7C2D12',
    letterSpacing: 8,
    marginTop: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  itemQty: { fontWeight: '800', color: '#7D8493', width: 36 },
  itemName: { flex: 1, fontWeight: '600', color: '#FFFFFF', fontSize: 15 },
  itemPrice: { fontWeight: '800', color: '#FFFFFF', fontSize: 15 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  totalLabel: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  totalValue: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  addrLabel: { fontSize: 12, fontWeight: '800', color: '#7D8493', textTransform: 'uppercase' },
  addrValue: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginTop: 4 },
  addrSub: { fontSize: 14, color: '#4B5563', marginTop: 4, fontWeight: '500' },
  muted: { color: '#7D8493', fontWeight: '600' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingCaption: { marginTop: 12, color: '#7D8493', fontWeight: '600', fontSize: 15 },
  errorText: { color: '#B91C1C', fontWeight: '800', fontSize: 16 },
  textBtn: { marginTop: 16, alignSelf: 'flex-start' },
  textBtnLabel: { color: '#A855F7', fontWeight: '800', fontSize: 16 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#A855F7',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  rateBtn: {
    marginBottom: 16,
    backgroundColor: '#A855F7',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  rateBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
});

export default function TrackOrderRoute() {
  return (
    <PaymentNavigationBoundary screenName="track-order/[orderId]">
      <TrackOrderScreen />
    </PaymentNavigationBoundary>
  );
}
