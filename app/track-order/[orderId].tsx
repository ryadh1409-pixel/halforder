/**
 * DoorDash-style customer live order tracking.
 * Route: /track-order/[orderId]
 *
 * Business logic (subscribe, ETA, chat, PIN rules) unchanged —
 * presentation lives in TrackOrderPresentation.
 */
import { PaymentNavigationBoundary } from '@/components/payment/PaymentNavigationBoundary';
import { TrackOrderPresentation } from '@/components/tracking/TrackOrderPresentation';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { EMPTY_DRIVER_VEHICLE, type DriverVehicleInfo } from '@/lib/driverVehicle';
import { logPaymentNavigation } from '@/lib/paymentNavigation';
import { logPaidStatusRepairIfNeeded } from '@/services/paymentFlowFirestore';
import { logCustomerRawDoc } from '@/lib/customerOrderSnapshotLog';
import {
  logCustomerTrackingUi,
  resolveCustomerTrackingUi,
} from '@/lib/customerTrackingLog';
import {
  customerTrackStepSubtitle,
  resolveCustomerTrackStep,
} from '@/lib/customerTrackStatus';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { orderRoomHref } from '@/services/orderChat';
import {
  looksLikeMarketplaceRestaurantOrder,
  subscribeCustomerOrderById,
  type RestaurantOrder,
} from '@/services/orderService';
import { useCustomerOrderLifecycleAlert } from '@/hooks/useOrderLifecycleAlerts';
import { useGroupDeliverySiblingStops } from '@/hooks/useGroupDeliverySiblingStops';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
import { toMapCoordinate } from '@/lib/location/coordinates';
import {
  resolveDeliveryCustomerStops,
  type DeliveryStopSource,
} from '@/lib/maps/deliveryStops';
import { UE } from '@/constants/uberEatsTheme';
import { formatOrderDateTimeAbsolute } from '@/utils/time';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    return { primary: `${mins} min`, secondary: km };
  }
  if (mins != null) {
    return { primary: `${mins} min`, secondary: 'Updating distance…' };
  }
  if (km) {
    return { primary: km, secondary: 'Updating ETA…' };
  }
  return { primary: 'Updating…', secondary: '' };
}

function TrackOrderScreen() {
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
        driverLocation: order.driverLocation ?? null,
      },
      'track-order-render',
    );
    logCustomerTrackingUi(orderId, order, 'track-order');
  }, [order, orderId, order?.status, order?.deliveryStatus, order?.driverLocation]);

  const deliveredAtLabel = useMemo(() => {
    if (!order) return null;
    const ms = order.deliveredAtMs ?? order.completedAtMs;
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
    const label = formatOrderDateTimeAbsolute(ms);
    return label === '—' ? null : label;
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

  const siblingStops = useGroupDeliverySiblingStops(order?.groupId, order?.id);

  const sharedRouteWaypoints = useMemo(() => {
    if (!order) return [] as { latitude: number; longitude: number }[];
    const source: DeliveryStopSource = {
      id: order.id,
      groupId: order.groupId,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      restaurantName: order.restaurant?.name ?? null,
      restaurantLocation: order.restaurantLocation,
      customerName: order.customer?.name ?? null,
      customerLocation:
        order.customerLocation ?? order.deliveryLocation ?? order.userLocation,
      deliveryAddress: order.deliveryAddress,
      deliveryStops: (order as { deliveryStops?: unknown }).deliveryStops,
      dropoffs: (order as { dropoffs?: unknown }).dropoffs,
      customers: (order as { customers?: unknown }).customers,
      dropoffLat: (order as { dropoffLat?: number | null }).dropoffLat ?? null,
      dropoffLng: (order as { dropoffLng?: number | null }).dropoffLng ?? null,
      dropoffName: (order as { dropoffName?: string | null }).dropoffName ?? null,
      pickupName: (order as { pickupName?: string | null }).pickupName ?? null,
      pickupLat: (order as { pickupLat?: number | null }).pickupLat ?? null,
      pickupLng: (order as { pickupLng?: number | null }).pickupLng ?? null,
      createdAtMs: order.createdAtMs,
    };
    const stops = resolveDeliveryCustomerStops(source, siblingStops);
    if (!customerCoord) {
      return stops.slice(1).map((s) => s.coordinate);
    }
    return stops
      .filter((stop) => {
        const dlat = Math.abs(stop.coordinate.latitude - customerCoord.latitude);
        const dlng = Math.abs(stop.coordinate.longitude - customerCoord.longitude);
        return dlat > 1e-5 || dlng > 1e-5;
      })
      .map((s) => s.coordinate);
  }, [order, siblingStops, customerCoord]);

  const liveRoute = useLiveDeliveryRoute({
    restaurant: restaurantCoord,
    driver: driverCoord,
    customer: customerCoord,
    remainingCustomers: sharedRouteWaypoints,
    enabled: !!order && !delivered,
    deliveryStatus: order?.deliveryStatus,
    kitchenStatus: order?.status,
  });

  const etaDisplay = useMemo(() => {
    if (!order) return { primary: '', secondary: '' };
    if (
      delivered ||
      order.status === 'delivered' ||
      order.status === 'completed' ||
      order.deliveryStatus === 'delivered'
    ) {
      return { primary: 'Done', secondary: '' };
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

  const callEnabled = Boolean(
    order && (order.driverPhone || order.driver?.phone),
  );

  const onClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orders' as never);
  }, []);

  const onHelp = useCallback(() => {
    Alert.alert(
      'Help',
      'Support is coming soon. For urgent issues, use Help from your profile.',
    );
  }, []);

  const onMessage = useCallback(() => {
    if (!order) return;
    router.push(
      orderRoomHref(order.id, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never,
    );
  }, [order]);

  const onCall = useCallback(() => {
    if (!order) return;
    const phone = order.driver?.phone || order.driverPhone;
    if (!phone) return;
    void Linking.openURL(`tel:${phone}`);
  }, [order]);

  const onTip = useCallback(() => {
    Alert.alert(
      'Tip your driver',
      'Driver tipping will be available soon. Thanks for supporting couriers.',
    );
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
          <ActivityIndicator size="large" color={UE.accent} />
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

  const hasAssignedDriver = Boolean(order.driverId || order.assignedDriverId);

  return (
    <TrackOrderPresentation
      order={order}
      delivered={delivered}
      deliveredAtLabel={deliveredAtLabel}
      title={trackingUi?.title ?? 'Order update'}
      subtitle={customerTrackStepSubtitle(resolveCustomerTrackStep(order))}
      progress={trackingUi?.progress ?? 0.1}
      etaPrimary={etaDisplay.primary}
      etaSecondary={etaDisplay.secondary}
      routeCoordinates={liveRoute.coordinates}
      etaMinutes={liveRoute.etaMinutes}
      driverFirstName={driverFirstName(order)}
      vehicle={
        hasAssignedDriver ? vehicleFromOrder(order) : { ...EMPTY_DRIVER_VEHICLE }
      }
      hasAssignedDriver={hasAssignedDriver}
      messageEnabled={driverChatEnabled}
      callEnabled={callEnabled}
      e2eCapture={e2eCapture}
      e2ePhase={e2ePhase}
      onClose={onClose}
      onHelp={onHelp}
      onMessage={onMessage}
      onCall={onCall}
      onTip={onTip}
    />
  );
}

const styles = StyleSheet.create({
  lightRoot: { flex: 1, backgroundColor: UE.bg, padding: 24 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingCaption: {
    marginTop: 12,
    color: UE.textMuted,
    fontWeight: '600',
    fontSize: 15,
  },
  errorText: { color: UE.promo, fontWeight: '800', fontSize: 16 },
  textBtn: { marginTop: 16, alignSelf: 'flex-start' },
  textBtnLabel: { color: UE.accent, fontWeight: '800', fontSize: 16 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: UE.accent,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: UE.radiusM,
    alignSelf: 'flex-start',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
});

export default function TrackOrderRoute() {
  return (
    <PaymentNavigationBoundary screenName="track-order/[orderId]">
      <TrackOrderScreen />
    </PaymentNavigationBoundary>
  );
}
