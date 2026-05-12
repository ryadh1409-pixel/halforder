/**
 * DoorDash-style customer live order tracking (light theme).
 * Route: /track-order/[orderId]
 */
import { resolveCustomerDeliveryPhase } from '@/constants/deliveryCustomerExperience';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { orderRoomHref } from '@/services/orderChat';
import {
  looksLikeMarketplaceRestaurantOrder,
  subscribeOrderById,
  type RestaurantOrder,
} from '@/services/orderService';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const WINDOW_H = Dimensions.get('window').height;
const MAP_HEIGHT = Math.round(WINDOW_H * 0.45);

type LatLng = { latitude: number; longitude: number };

function toLatLng(
  loc: { lat: number; lng: number } | null | undefined,
): LatLng | null {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  return { latitude: loc.lat, longitude: loc.lng };
}

class MapErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function MapFallbackCard({ pickup, dropoff }: { pickup: string; dropoff: string }) {
  return (
    <LinearGradient
      colors={['#E8F4FF', '#FFFFFF', '#FFF5F0']}
      style={styles.mapFallbackRoot}
    >
      <Text style={styles.mapFallbackTitle}>Delivery route</Text>
      <View style={styles.mapFallbackRow}>
        <Text style={styles.mapFallbackEmoji}>📍</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.mapFallbackLabel}>Pickup</Text>
          <Text style={styles.mapFallbackAddr}>{pickup || 'Restaurant address'}</Text>
        </View>
      </View>
      <View style={styles.mapFallbackDivider} />
      <View style={styles.mapFallbackRow}>
        <Text style={styles.mapFallbackEmoji}>🏠</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.mapFallbackLabel}>Dropoff</Text>
          <Text style={styles.mapFallbackAddr}>{dropoff || 'Your address'}</Text>
        </View>
      </View>
      <Text style={styles.mapFallbackHint}>Map unavailable — details update live below.</Text>
    </LinearGradient>
  );
}

type MapsModule = typeof import('react-native-maps');

function TrackingMapInner({
  restaurant,
  dropoff,
  driver,
  pickupLabel,
  dropoffLabel,
}: {
  restaurant: LatLng | null;
  dropoff: LatLng | null;
  driver: LatLng | null;
  pickupLabel: string;
  dropoffLabel: string;
}) {
  const mapRef = useRef<any>(null);
  const [maps, setMaps] = useState<MapsModule | null | undefined>(undefined);
  const driverAnimRef = useRef<InstanceType<MapsModule['AnimatedRegion']> | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setMaps(null);
      return;
    }
    try {
      setMaps(require('react-native-maps') as MapsModule);
    } catch {
      setMaps(null);
    }
  }, []);

  const defaultCenter = restaurant ?? dropoff ?? driver ?? { latitude: 37.7749, longitude: -122.4194 };

  useEffect(() => {
    if (!maps) return;
    if (!driverAnimRef.current) {
      driverAnimRef.current = new maps.AnimatedRegion({
        ...defaultCenter,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      seededRef.current = false;
    }
  }, [maps, defaultCenter.latitude, defaultCenter.longitude]);

  useEffect(() => {
    if (!maps || !driver || !driverAnimRef.current) return;
    const anim = driverAnimRef.current;
    if (!seededRef.current) {
      anim.setValue({ ...driver, latitudeDelta: 0, longitudeDelta: 0 });
      seededRef.current = true;
      return;
    }
    anim
      .timing({
        latitude: driver.latitude,
        longitude: driver.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: 850,
        useNativeDriver: false,
      } as never)
      .start();
  }, [maps, driver?.latitude, driver?.longitude]);

  const polyline = useMemo(() => {
    const pts: LatLng[] = [];
    if (restaurant) pts.push(restaurant);
    if (driver) pts.push(driver);
    if (dropoff) pts.push(dropoff);
    return pts;
  }, [restaurant, driver, dropoff]);

  useEffect(() => {
    if (!mapRef.current || polyline.length < 2) return;
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates?.(polyline, {
          edgePadding: { top: 100, right: 36, bottom: 40, left: 36 },
          animated: true,
        });
      } catch {
        /* ignore */
      }
    }, 450);
    return () => clearTimeout(t);
  }, [polyline]);

  const fallback = <MapFallbackCard pickup={pickupLabel} dropoff={dropoffLabel} />;

  if (maps === undefined) {
    return (
      <View style={[styles.mapView, styles.mapLoading]}>
        <ActivityIndicator color="#FF3008" />
      </View>
    );
  }

  if (!maps) {
    return fallback;
  }

  const MapView = maps.default;
  const Marker = maps.Marker;
  const MarkerAnimated = maps.MarkerAnimated;
  const Polyline = maps.Polyline;
  const anim = driverAnimRef.current;

  return (
    <MapView
      ref={mapRef}
      style={styles.mapView}
      initialRegion={{
        latitude: defaultCenter.latitude,
        longitude: defaultCenter.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      }}
      userInterfaceStyle="light"
      showsCompass={false}
      toolbarEnabled={false}
    >
      {restaurant ? (
        <Marker coordinate={restaurant} tracksViewChanges={false} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.markerBubble}>
            <Text style={styles.markerEmoji}>📍</Text>
          </View>
        </Marker>
      ) : null}
      {dropoff ? (
        <Marker coordinate={dropoff} tracksViewChanges={false} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.markerBubble}>
            <Text style={styles.markerEmoji}>🏠</Text>
          </View>
        </Marker>
      ) : null}
      {driver && anim && MarkerAnimated ? (
        <MarkerAnimated coordinate={anim as never} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Text style={styles.driverMarkerEmoji}>🚗</Text>
          </View>
        </MarkerAnimated>
      ) : driver ? (
        <Marker coordinate={driver} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Text style={styles.driverMarkerEmoji}>🚗</Text>
          </View>
        </Marker>
      ) : null}
      {polyline.length >= 2 ? (
        <Polyline coordinates={polyline} strokeColor="#FF3008" strokeWidth={4} />
      ) : null}
    </MapView>
  );
}

function TrackingMap({ order }: { order: RestaurantOrder }) {
  const restaurant = toLatLng(order.restaurantLocation);
  const dropoff = toLatLng(order.deliveryLocation);
  const driver = order.driverLocation ? toLatLng(order.driverLocation) : null;
  const pickupLabel =
    order.restaurant?.address?.trim() || order.restaurant?.name || 'Restaurant';
  const dropoffLabel =
    order.deliveryLocation?.address?.trim() || order.customer?.address || 'Your address';
  const fallback = <MapFallbackCard pickup={pickupLabel} dropoff={dropoffLabel} />;

  if (Platform.OS === 'web') {
    return fallback;
  }

  return (
    <MapErrorBoundary fallback={fallback}>
      <TrackingMapInner
        key={order.id}
        restaurant={restaurant}
        dropoff={dropoff}
        driver={driver}
        pickupLabel={pickupLabel}
        dropoffLabel={dropoffLabel}
      />
    </MapErrorBoundary>
  );
}

export default function TrackOrderScreen() {
  const insets = useSafeAreaInsets();
  const { orderId: rawId } = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = useMemo(() => {
    const v = Array.isArray(rawId) ? rawId[0] : rawId;
    return typeof v === 'string' ? v.trim() : '';
  }, [rawId]);

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

  const driverChatEnabled =
    !!order &&
    typeof order.driverId === 'string' &&
    order.driverId.length > 0 &&
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

  if (!order || !looksLikeMarketplaceRestaurantOrder(order)) {
    return (
      <SafeAreaView style={styles.lightRoot} edges={['top']}>
        <Text style={styles.errorText}>We couldn’t load this delivery.</Text>
        <Pressable
          onPress={() => router.replace(`/order/${encodeURIComponent(orderId)}` as never)}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>Open order</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const etaText =
    order.status === 'delivered'
      ? 'Completed'
      : `Arriving in about ${order.estimatedDeliveryTime} min`;

  return (
    <View style={styles.screenRoot}>
      <View style={[styles.mapSection, { height: MAP_HEIGHT }]}>
        <TrackingMap order={order} />

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
            <Text style={styles.statusTitle}>{phase?.title ?? 'Order update'}</Text>
            <Text style={styles.statusSubtitle}>
              {phase?.subtitle ?? 'We’ll keep this page updated in real time.'}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round((phase?.progress ?? 0.1) * 100)}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.etaCard}>
            <Text style={styles.etaLabel}>Estimated arrival</Text>
            <Text style={styles.etaValue}>{etaText}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeading}>Your courier</Text>
            <View style={styles.driverRow}>
              <View style={styles.driverAvatar}>
                {order.driver?.avatar ? (
                  <Image source={{ uri: order.driver.avatar }} style={styles.driverAvatarImg} />
                ) : (
                  <Text style={styles.driverAvatarPlaceholder}>🙂</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>
                  {order.driver?.name?.trim() || order.driverName || 'Matching a driver…'}
                </Text>
                <Text style={styles.driverMeta}>
                  {(order.driver?.vehicle || order.driverVehicle || 'Delivery vehicle').toString()}
                </Text>
                <Text style={styles.driverRating}>★ 5.0 · On-time delivery</Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.outlineBtn, !driverChatEnabled && styles.outlineBtnDisabled]}
                disabled={!driverChatEnabled}
                onPress={() =>
                  router.push(orderRoomHref(order.id, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never)
                }
              >
                <Text style={styles.outlineBtnText}>Chat</Text>
              </Pressable>
              {order.driverPhone || order.driver?.phone ? (
                <Pressable
                  style={styles.outlineBtn}
                  onPress={() =>
                    void Linking.openURL(`tel:${order.driver?.phone || order.driverPhone}`)
                  }
                >
                  <Text style={styles.outlineBtnText}>Call</Text>
                </Pressable>
              ) : (
                <View style={[styles.outlineBtn, styles.outlineBtnDisabled]}>
                  <Text style={styles.outlineBtnMuted}>Call</Text>
                </View>
              )}
            </View>
          </View>

          {order.deliveryPin && order.status !== 'delivered' && order.paymentStatus === 'paid' ? (
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
  screenRoot: { flex: 1, backgroundColor: '#FFFFFF' },
  lightRoot: { flex: 1, backgroundColor: '#FFFFFF', padding: 24 },
  mapSection: {
    width: '100%',
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  mapView: { ...StyleSheet.absoluteFillObject },
  mapLoading: { alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  circleBtnX: { fontSize: 18, color: '#111827', fontWeight: '700' },
  helpPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  helpPillText: { fontWeight: '800', color: '#111827', fontSize: 15 },
  mapFallbackRoot: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
  },
  mapFallbackTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 18,
  },
  mapFallbackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mapFallbackEmoji: { fontSize: 28, marginTop: 2 },
  mapFallbackLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' },
  mapFallbackAddr: { fontSize: 15, fontWeight: '600', color: '#0F172A', marginTop: 4, lineHeight: 22 },
  mapFallbackDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
    marginVertical: 16,
  },
  mapFallbackHint: { fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 8 },
  markerBubble: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  markerEmoji: { fontSize: 22 },
  driverMarker: {
    backgroundColor: '#FFFFFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF3008',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  driverMarkerEmoji: { fontSize: 22 },
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#E5E7EB',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetScroll: { paddingHorizontal: 20, paddingBottom: 32 },
  statusBlock: { marginBottom: 16 },
  statusTitle: { fontSize: 26, fontWeight: '900', color: '#111827', letterSpacing: -0.5 },
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
    backgroundColor: '#E5E7EB',
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#FF3008', borderRadius: 2 },
  etaCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  etaLabel: { fontSize: 12, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' },
  etaValue: { fontSize: 20, fontWeight: '900', color: '#111827', marginTop: 6 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  cardHeading: { fontSize: 13, fontWeight: '800', color: '#6B7280', marginBottom: 12, textTransform: 'uppercase' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarImg: { width: '100%', height: '100%' },
  driverAvatarPlaceholder: { fontSize: 28 },
  driverName: { fontSize: 18, fontWeight: '900', color: '#111827' },
  driverMeta: { fontSize: 14, color: '#4B5563', fontWeight: '600', marginTop: 4 },
  driverRating: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  outlineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  outlineBtnDisabled: { opacity: 0.45 },
  outlineBtnText: { fontWeight: '900', fontSize: 16, color: '#111827' },
  outlineBtnMuted: { fontWeight: '800', fontSize: 16, color: '#9CA3AF' },
  pinBanner: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
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
    borderBottomColor: '#E5E7EB',
    gap: 10,
  },
  itemQty: { fontWeight: '800', color: '#6B7280', width: 36 },
  itemName: { flex: 1, fontWeight: '600', color: '#111827', fontSize: 15 },
  itemPrice: { fontWeight: '800', color: '#111827', fontSize: 15 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalLabel: { fontSize: 16, fontWeight: '800', color: '#111827' },
  totalValue: { fontSize: 18, fontWeight: '900', color: '#111827' },
  addrLabel: { fontSize: 12, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' },
  addrValue: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 4 },
  addrSub: { fontSize: 14, color: '#4B5563', marginTop: 4, fontWeight: '500' },
  muted: { color: '#9CA3AF', fontWeight: '600' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingCaption: { marginTop: 12, color: '#6B7280', fontWeight: '600', fontSize: 15 },
  errorText: { color: '#B91C1C', fontWeight: '800', fontSize: 16 },
  textBtn: { marginTop: 16, alignSelf: 'flex-start' },
  textBtnLabel: { color: '#FF3008', fontWeight: '800', fontSize: 16 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#FF3008',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
});
