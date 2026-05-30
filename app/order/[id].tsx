import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import { RoleScopedOrderDetailGateway } from '@/components/layout/RoleScopedOrderDetailGateway';
import { PaymentNavigationBoundary } from '@/components/payment/PaymentNavigationBoundary';
import { logPaymentNavigation } from '@/lib/paymentNavigation';
import { CustomerOrderDetailsScreen } from '@/components/orders/customer/CustomerOrderDetailsScreen';
import { DriverOrderDetailsScreen } from '@/components/orders/driver/DriverOrderDetailsScreen';
import { RestaurantOrderDetailsScreen } from '@/components/orders/restaurant/RestaurantOrderDetailsScreen';
import HalfOrderDetailsScreen from '@/screens/HalfOrderDetailsScreen';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import {
  looksLikeMarketplaceRestaurantOrder,
  mapDocToRestaurantOrder,
  type RestaurantOrder,
} from '@/services/orderService';
import { resolveMarketplaceOrderViewerRole } from '@/services/orderViewerRole';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapRenderer from '@/components/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';

const GOLD = '#C8941A';
const GREEN = '#00A651';
const BLUE = '#1A6FE8';
const NAVY = '#1A2744';
const GRAY = '#666666';
const BORDER = '#E0E0E0';
const BG = '#F8F8F8';

type LiveLoc = { lat: number; lng: number } | null;

type TrackingPhase = 'picking_up' | 'heading_your_way' | 'arriving' | 'delivered';

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const coordinates: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coordinates;
}

function trackingPhaseFromOrder(o: RestaurantOrder): TrackingPhase {
  const ds = o.deliveryStatus;
  if (o.status === 'delivered' || ds === 'delivered') return 'delivered';
  if (ds === 'near_customer' || o.status === 'arrived_customer') return 'arriving';
  if (ds === 'picked_up' || ds === 'on_the_way' || o.status === 'picked_up' || o.status === 'on_the_way') {
    return 'heading_your_way';
  }
  return 'picking_up';
}

function filledSegments(phase: TrackingPhase): number {
  if (phase === 'delivered' || phase === 'arriving') return 4;
  if (phase === 'heading_your_way') return 3;
  return 2;
}

function statusTitle(phase: TrackingPhase): string {
  switch (phase) {
    case 'heading_your_way':
      return 'Heading your way…';
    case 'arriving':
      return 'Almost there…';
    case 'delivered':
      return 'Delivered';
    default:
      return 'Picking up your order…';
  }
}

function formatEtaLabel(order: RestaurantOrder): string {
  const mins = typeof order.estimatedDeliveryTime === 'number' ? order.estimatedDeliveryTime : 25;
  const t = Date.now() + mins * 60_000;
  try {
    return `Arrives ${new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ⓘ`;
  } catch {
    return `Arrives in ~${mins} min ⓘ`;
  }
}

function plateFromId(id: string | null | undefined): string {
  if (!id || id.length < 4) return 'COURIER';
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-6);
  return tail.length >= 4 ? tail : 'CFTN950';
}

function OrderTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id.trim() : '';
  const { user, firestoreUserRole } = useAuth();

  const [order, setOrder] = useState<RestaurantOrder | null | undefined>(undefined);
  const [liveDriver, setLiveDriver] = useState<LiveLoc>(null);
  const [expandedDetails, setExpandedDetails] = useState(false);
  const sheetAnim = useRef(new Animated.Value(48)).current;
  const { height: winH } = Dimensions.get('window');
  const mapHeight = Math.round(winH * 0.45);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return undefined;
    }
    const unsubOrder = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        if (!snap.exists()) {
          setOrder(null);
          return;
        }
        try {
          setOrder(mapDocToRestaurantOrder(snap));
        } catch {
          setOrder(null);
        }
      },
      () => setOrder(null),
    );
    return unsubOrder;
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return undefined;
    const unsub = onSnapshot(
      doc(db, 'live_locations', orderId),
      (snap) => {
        if (!snap.exists()) {
          setLiveDriver(null);
          return;
        }
        const d = snap.data() as Record<string, unknown>;
        const lat = typeof d.lat === 'number' ? d.lat : null;
        const lng = typeof d.lng === 'number' ? d.lng : null;
        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
          setLiveDriver({ lat, lng });
        } else {
          setLiveDriver(null);
        }
      },
      () => setLiveDriver(null),
    );
    return unsub;
  }, [orderId]);

  useEffect(() => {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [sheetAnim]);

  const phase = useMemo(() => (order ? trackingPhaseFromOrder(order) : 'picking_up'), [order]);
  const filled = filledSegments(phase);

  const driverCoord = useMemo(() => {
    if (liveDriver) return liveDriver;
    if (order?.driverLocation) return { lat: order.driverLocation.lat, lng: order.driverLocation.lng };
    return null;
  }, [liveDriver, order]);

  const destCoord = useMemo(() => {
    if (!order?.deliveryLocation) return null;
    return { lat: order.deliveryLocation.lat, lng: order.deliveryLocation.lng };
  }, [order]);

  const routeCoords = useMemo(() => {
    if (order?.routePolyline) {
      try {
        const decoded = decodePolyline(order.routePolyline);
        if (decoded.length >= 2) return decoded;
      } catch {
        /* ignore */
      }
    }
    if (driverCoord && destCoord) {
      return [
        { latitude: driverCoord.lat, longitude: driverCoord.lng },
        { latitude: destCoord.lat, longitude: destCoord.lng },
      ];
    }
    return [];
  }, [order?.routePolyline, driverCoord, destCoord]);

  const initialRegion = useMemo(() => {
    const d = destCoord;
    const dr = driverCoord;
    if (d && dr) {
      const lat = (d.lat + dr.lat) / 2;
      const lng = (d.lng + dr.lng) / 2;
      const dlat = Math.abs(d.lat - dr.lat) * 2.2 || 0.02;
      const dlng = Math.abs(d.lng - dr.lng) * 2.2 || 0.02;
      return {
        latitude: lat,
        longitude: lng,
        latitudeDelta: Math.max(dlat, 0.02),
        longitudeDelta: Math.max(dlng, 0.02),
      };
    }
    if (d) {
      return {
        latitude: d.lat,
        longitude: d.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    if (dr) {
      return {
        latitude: dr.lat,
        longitude: dr.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    return {
      latitude: 43.761,
      longitude: -79.411,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [driverCoord, destCoord]);

  if (!orderId) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, backgroundColor: BG }]}>
        <Text style={styles.missingTitle}>Missing order</Text>
        <Text style={styles.missingSub}>This link does not include an order id.</Text>
      </View>
    );
  }

  if (order === undefined) {
    return (
      <View style={[styles.loadingRoot, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>Loading order…</Text>
      </View>
    );
  }

  if (order === null) {
    return (
      <View style={[styles.loadingRoot, { paddingTop: insets.top }]}>
        <Text style={styles.missingTitle}>Order not found</Text>
        <Text style={styles.missingSub}>We could not load this order.</Text>
        <Pressable style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!looksLikeMarketplaceRestaurantOrder(order)) {
    return <HalfOrderDetailsScreen orderId={orderId} />;
  }

  const viewerRole = resolveMarketplaceOrderViewerRole(order, user?.uid, firestoreUserRole);
  if (viewerRole === 'driver') {
    return <DriverOrderDetailsScreen order={order} />;
  }
  if (viewerRole === 'restaurant') {
    if (!isOrderFresh(order)) {
      return (
        <View style={[styles.loadingRoot, { paddingTop: insets.top }]}>
          <Text style={styles.missingTitle}>Order no longer available</Text>
          <Text style={styles.missingSub}>
            Restaurant dashboards only show orders from the last 24 hours.
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>Go back</Text>
          </Pressable>
        </View>
      );
    }
    return <RestaurantOrderDetailsScreen order={order} />;
  }
  if (viewerRole === 'customer' || viewerRole === 'admin') {
    return <CustomerOrderDetailsScreen order={order} />;
  }

  const driverName = order.driver?.name?.trim() || 'Your courier';
  const driverVehicle = order.driver?.vehicle?.trim() || 'Toyota Corolla';
  const driverAvatar = order.driver?.avatar;
  const driverPhone = order.driver?.phone || order.driverPhone || '';
  const pin = order.deliveryPin ?? '0000';
  const pinDigits = pin.padStart(4, '0').slice(0, 4).split('');
  const addressLine =
    order.deliveryLocation?.address?.trim() ||
    order.customer.address?.trim() ||
    'Delivery address';
  const phoneDisplay = order.customerPhone?.trim() || '+1 —';
  const restaurantName = order.restaurant.name?.trim() || 'Restaurant';
  const totalStr = `$${order.totalPrice.toFixed(2)}`;
  const last4 =
    order.paymentIntentId && order.paymentIntentId.length >= 4
      ? order.paymentIntentId.slice(-4)
      : '9706';
  const payerName = order.customer.name?.trim() || 'You';

  return (
    <View style={styles.root}>
      <View style={[styles.mapWrap, { height: mapHeight }]}>
        <MapRenderer
          style={styles.map}
          mapType="standard"
          useGoogleProviderOnAndroid
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          initialRegion={initialRegion}
          markers={[
            ...(driverCoord
              ? [
                  {
                    id: 'driver',
                    latitude: driverCoord.lat,
                    longitude: driverCoord.lng,
                    variant: 'driver' as const,
                  },
                ]
              : []),
            ...(destCoord
              ? [
                  {
                    id: 'dest',
                    latitude: destCoord.lat,
                    longitude: destCoord.lng,
                    variant: 'destination' as const,
                  },
                ]
              : []),
          ]}
          polylines={
            routeCoords.length >= 2
              ? [
                  {
                    id: 'route',
                    coordinates: routeCoords,
                    strokeColor: '#000000',
                    strokeWidth: 3,
                  },
                ]
              : []
          }
          webTitle="Delivery"
          webSubtitle={restaurantName}
          webEtaText={formatEtaLabel(order)}
          webFromCoordsText={addressLine}
          webToCoordsText={restaurantName}
        />

        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={[styles.mapIconBtn, { top: Math.max(50, insets.top + 8), left: 16 }]}
        >
          <Ionicons name="close" size={22} color="#000" />
        </Pressable>
        <Pressable
          accessibilityLabel="Help"
          onPress={() => void Linking.openURL('https://halforder.app/help').catch(() => undefined)}
          style={[styles.mapHelpPill, { top: Math.max(50, insets.top + 8), right: 16 }]}
        >
          <Text style={styles.mapHelpText}>? Help</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.sheet,
          {
            flex: 1,
            transform: [{ translateY: sheetAnim }],
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
          bounces
        >
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>{statusTitle(phase)}</Text>
            <Text style={styles.statusSubtitle}>{formatEtaLabel(order)}</Text>
            <View style={styles.progressRow}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.progressSeg,
                    { backgroundColor: i < filled ? GOLD : '#E0E0E0' },
                  ]}
                />
              ))}
            </View>

            {phase === 'picking_up' ? (
              <View style={styles.pinRow}>
                <Pressable style={styles.pinButton} onPress={() => undefined}>
                  <View style={styles.pinButtonInner}>
                    <MaterialIcons name="apps" size={22} color="#FFF" />
                    <Text style={styles.pinButtonLabel}>Share delivery PIN</Text>
                    <View style={styles.pinDigitsRow}>
                      {pinDigits.map((d, idx) => (
                        <View key={idx} style={styles.pinDigitBox}>
                          <Text style={styles.pinDigitText}>{d}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.driverRow}>
            <View style={styles.avatarCluster}>
              <View style={styles.carPlate}>
                <Text style={styles.carEmoji}>🚙</Text>
              </View>
              {driverAvatar ? (
                <Image source={{ uri: driverAvatar }} style={styles.driverPhoto} contentFit="cover" />
              ) : (
                <View style={[styles.driverPhoto, styles.driverPhotoPh]}>
                  <Text style={styles.driverPhotoPhText}>{driverName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <View style={styles.driverMid}>
              <View style={styles.driverNameRow}>
                <Text style={styles.driverNameGreen}>{driverName}</Text>
                <Text style={styles.driverPlate}> • {plateFromId(order.driver?.id)}</Text>
              </View>
              <Text style={styles.driverVehicle}>{driverVehicle}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.uberOneDot} />
                <Text style={styles.badgeText}>Top-rated courier</Text>
              </View>
              <Text style={styles.ratingSmall}>97% 👍</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.circleAction}
              onPress={() => {
                if (driverPhone) void Linking.openURL(`tel:${driverPhone.replace(/\s/g, '')}`);
              }}
            >
              <Ionicons name="call" size={20} color="#000" />
            </Pressable>
            <Pressable style={styles.msgPill} onPress={() => router.push(`/chat/${orderId}` as never)}>
              <Text style={styles.msgPillText}>Send a message</Text>
            </Pressable>
            <Pressable style={styles.tipPill} onPress={() => undefined}>
              <Text style={styles.tipPillText}>+ Tip</Text>
            </Pressable>
          </View>

          <View style={styles.detailsCard}>
            <Pressable style={styles.detailsHeader} onPress={() => setExpandedDetails((v) => !v)}>
              <Text style={styles.detailsHeaderTitle}>Delivery details</Text>
              <Ionicons name={expandedDetails ? 'chevron-up' : 'chevron-down'} size={22} color="#000" />
            </Pressable>
            {expandedDetails ? (
              <View style={styles.detailsBody}>
                <Text style={styles.meetDoor}>{`Meet at my door at ${addressLine.split(',')[0] ?? addressLine}`}</Text>
                <Text style={styles.sectionH}>Delivery details</Text>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Address</Text>
                  <Text style={styles.kvValue}>{addressLine}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Drop-off option</Text>
                  <Text style={styles.kvValue}>Meet at my door</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Phone number</Text>
                  <Text style={styles.kvValue}>{phoneDisplay}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Delivery option</Text>
                  <Text style={styles.kvValue}>Standard</Text>
                </View>
                <Pressable style={styles.instructionsPill} onPress={() => undefined}>
                  <Text style={styles.instructionsPillText}>Add delivery instructions</Text>
                </Pressable>
                <View style={styles.shareRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shareTitle}>Share this delivery</Text>
                    <Text style={styles.shareSub}>Let someone follow along</Text>
                  </View>
                  <Pressable
                    style={styles.shareMini}
                    onPress={() =>
                      void Share.share({
                        message: `Follow my delivery: ${orderId}`,
                      }).catch(() => undefined)
                    }
                  >
                    <Text style={styles.shareMiniText}>Share</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.orderSummary}>
            <View style={styles.orderSummaryHeader}>
              <Text style={styles.sectionH}>Order summary</Text>
              <Pressable onPress={() => router.push(`/track-order/${encodeURIComponent(orderId)}` as never)}>
                <Text style={styles.viewDetails}>View details</Text>
              </Pressable>
            </View>
            <Text style={styles.restGray}>{restaurantName}</Text>
            {order.items.map((it) => (
              <View key={it.id} style={styles.itemRow}>
                <View style={styles.qtyBox}>
                  <Text style={styles.qtyText}>{it.qty}</Text>
                </View>
                <Text style={styles.itemName} numberOfLines={2}>
                  {it.name}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{totalStr}</Text>
            </View>
            <View style={styles.visaRow}>
              <View style={styles.visaLogo}>
                <Text style={styles.visaLogoText}>VISA</Text>
              </View>
              <Text style={styles.visaLine} numberOfLines={2}>
                {`Visa ••••${last4} (${payerName})`}
              </Text>
              <Pressable style={styles.switchPill} onPress={() => undefined}>
                <Text style={styles.switchPillText}>Switch</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  loadingRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG },
  loadingText: { marginTop: 12, color: GRAY, fontSize: 15, fontWeight: '600' },
  missingTitle: { fontSize: 20, fontWeight: '800', color: '#000' },
  missingSub: { marginTop: 8, fontSize: 14, color: GRAY, fontWeight: '500' },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: BLUE,
  },
  retryBtnText: { color: '#FFF', fontWeight: '700' },
  mapWrap: { width: '100%', backgroundColor: '#E5E5E5' },
  map: { flex: 1 },
  mapIconBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapHelpPill: {
    position: 'absolute',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapHelpText: { fontSize: 14, fontWeight: '700', color: '#000' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingBottom: 32 },
  statusBlock: { paddingHorizontal: 20, paddingTop: 20 },
  statusTitle: { fontWeight: '700', fontSize: 22, color: '#000000' },
  statusSubtitle: { fontSize: 14, color: GRAY, marginTop: 4 },
  progressRow: { marginTop: 12, height: 4, flexDirection: 'row', gap: 4 },
  progressSeg: { flex: 1, borderRadius: 2, height: 4 },
  pinRow: { marginTop: 12 },
  pinButton: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  pinButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinButtonLabel: { color: '#FFF', fontWeight: '700', fontSize: 15, flex: 1, textAlign: 'center' },
  pinDigitsRow: { flexDirection: 'row', gap: 8 },
  pinDigitBox: {
    width: 36,
    height: 44,
    borderRadius: 8,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDigitText: { color: '#FFF', fontWeight: '700', fontSize: 20 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 16, marginHorizontal: 20 },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  avatarCluster: { width: 100, height: 64, position: 'relative' },
  carPlate: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 80,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#ECECEC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  carEmoji: { fontSize: 28 },
  driverPhoto: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#DDD',
  },
  driverPhotoPh: { alignItems: 'center', justifyContent: 'center' },
  driverPhotoPhText: { fontSize: 22, fontWeight: '800', color: '#64748B' },
  driverMid: { flex: 1, marginLeft: 12 },
  driverNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  driverNameGreen: { fontSize: 16, fontWeight: '700', color: GREEN },
  driverPlate: { fontSize: 14, color: GRAY },
  driverVehicle: { fontSize: 14, color: '#000', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  uberOneDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: GOLD,
  },
  badgeText: { fontSize: 13, color: GRAY },
  ratingSmall: { fontSize: 13, color: GRAY, marginTop: 6 },
  actionRow: {
    marginTop: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  circleAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgPillText: { fontSize: 14, color: '#000', fontWeight: '600' },
  tipPill: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipPillText: { fontSize: 14, color: '#000', fontWeight: '600' },
  detailsCard: {
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    overflow: 'hidden',
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  detailsHeaderTitle: { fontWeight: '700', fontSize: 16, color: '#000' },
  detailsBody: { paddingHorizontal: 14, paddingBottom: 14 },
  meetDoor: { fontWeight: '700', fontSize: 16, marginTop: 8, color: '#000' },
  sectionH: { fontWeight: '700', fontSize: 18, marginTop: 16, color: '#000' },
  kvRow: { marginTop: 12 },
  kvLabel: { fontSize: 13, color: GRAY, marginBottom: 4 },
  kvValue: { fontSize: 15, color: '#000', fontWeight: '500' },
  instructionsPill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F3F3F3',
  },
  instructionsPillText: { fontSize: 13, color: GRAY, fontWeight: '600' },
  shareRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shareTitle: { fontWeight: '700', fontSize: 15, color: '#000' },
  shareSub: { fontSize: 13, color: GRAY, marginTop: 2 },
  shareMini: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFF',
  },
  shareMiniText: { fontWeight: '700', fontSize: 13, color: '#000' },
  orderSummary: { marginTop: 16, paddingHorizontal: 20 },
  orderSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewDetails: { color: GREEN, fontWeight: '700', fontSize: 14 },
  restGray: { color: GRAY, fontSize: 14, marginTop: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  qtyBox: {
    minWidth: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  qtyText: { fontSize: 13, fontWeight: '700', color: '#000' },
  itemName: { flex: 1, fontSize: 15, color: '#000', fontWeight: '500' },
  totalRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#000' },
  totalValue: { fontSize: 16, fontWeight: '700', color: '#000' },
  visaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  visaLogo: {
    width: 44,
    height: 28,
    borderRadius: 4,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visaLogoText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  visaLine: { flex: 1, fontSize: 13, color: '#000', fontWeight: '500' },
  switchPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFF',
  },
  switchPillText: { fontSize: 13, fontWeight: '700', color: '#000' },
});

export default function OrderDetailRoute() {
  return (
    <PaymentNavigationBoundary screenName="order/[id]">
      <RoleScopedOrderDetailGateway>
        <OrderTrackingScreen />
      </RoleScopedOrderDetailGateway>
    </PaymentNavigationBoundary>
  );
}
