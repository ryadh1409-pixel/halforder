import {
  MarketplaceOrderCard,
  type MarketplaceOrdersFeedRow,
} from '@/components/orders/MarketplaceOrderCard';
import { getOrderListSection, type OrderListSection } from '@/constants/orderStatus';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { normalizeDeliveryStatus } from '@/services/deliveryStatus';
import { formatAddress, formatRestaurantName } from '@/utils/orderFormatters';
import { safeToMillis } from '@/utils/safeToMillis';
import { orderDetailHref } from '@/lib/orderRoutes';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { reportContentIdOrder, submitReport } from '@/services/reports';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { BlurView } from 'expo-blur';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TAB_SPINNER = '#22C55E';
const COMPLETED_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;
type OrderHistoryFilter = 'active' | 'completed' | 'cancelled';

const PROGRESS_KEYS = [
  'awaiting_payment',
  'payment_processing',
  'pending_driver',
  'pending',
  'restaurant_accepted',
  'preparing',
  'ready_for_pickup',
  'picked_up',
  'on_the_way',
  'arrived_customer',
  'delivered',
] as const;

function listProgressFromStatus(status: string): number {
  const s = status.trim().toLowerCase();
  const i = PROGRESS_KEYS.indexOf(s as (typeof PROGRESS_KEYS)[number]);
  if (i >= 0) return (i + 1) / PROGRESS_KEYS.length;
  return 0.18;
}

function sectionFromOrder(data: Record<string, unknown>): OrderListSection {
  const status = typeof data.status === 'string' ? data.status : 'awaiting_payment';
  const deliveryStatus =
    typeof data.deliveryStatus === 'string' ? data.deliveryStatus.trim().toLowerCase() : '';
  if (status === 'cancelled' || status === 'expired' || deliveryStatus === 'cancelled') {
    return 'cancelled';
  }
  if (
    status === 'completed' ||
    status === 'delivered' ||
    deliveryStatus === 'delivered'
  ) {
    return 'completed';
  }
  return getOrderListSection(status);
}

function terminalTimeMs(data: Record<string, unknown>): number | null {
  return (
    safeToMillis(data.completedAt) ??
    safeToMillis(data.deliveredAt) ??
    safeToMillis(data.updatedAt) ??
    safeToMillis(data.createdAt)
  );
}

function shouldShowMobileOrder(data: Record<string, unknown>): boolean {
  if (sectionFromOrder(data) !== 'completed') return true;
  const ms = terminalTimeMs(data);
  return ms == null || Date.now() - ms <= COMPLETED_HISTORY_MS;
}

function driverSummaryFromDoc(data: Record<string, unknown>): string | null {
  const ds = data.deliveryStatus;
  if (typeof ds !== 'string') return null;
  const n = normalizeDeliveryStatus(ds);
  const labels: Record<string, string> = {
    waiting_driver: 'Driver matching',
    driver_assigned: 'Driver assigned',
    heading_to_restaurant: 'Heading to restaurant',
    arrived_restaurant: 'At restaurant',
    picked_up: 'Picked up',
    on_the_way: 'On the way',
    near_customer: 'Driver nearby',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  return labels[n] ?? n.replace(/_/g, ' ');
}

function createdLabel(ms: number | null): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function GlassBar({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={55} tint="dark" style={[styles.glass, style]}>
        {children}
      </BlurView>
    );
  }
  return <View style={[styles.glass, styles.glassAndroid, style]}>{children}</View>;
}

function mapDocToFeedRow(
  d: QueryDocumentSnapshot,
  restaurantImages: Record<string, string | null>,
): MarketplaceOrdersFeedRow {
  const data = d.data() as Record<string, unknown>;
  const createdAtMs = safeToMillis(data.createdAt);

  const status = typeof data.status === 'string' ? data.status : 'awaiting_payment';
  const paymentStatus = typeof data.paymentStatus === 'string' ? data.paymentStatus : 'unpaid';
  const section = sectionFromOrder(data);

  const participants: string[] = Array.isArray(data.participants)
    ? data.participants.filter((x): x is string => typeof x === 'string')
    : [];
  const halfUsers: string[] = Array.isArray(data.users)
    ? data.users.filter((x): x is string => typeof x === 'string')
    : [];
  const usesHalf = halfUsers.length > 0;
  const participantCount = usesHalf
    ? Math.max(halfUsers.length, participants.length, 1)
    : Math.max(participants.length, 1);

  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const itemsPreview = itemsRaw.slice(0, 4).map((item) => {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      return {
        qty: typeof o.qty === 'number' ? o.qty : Number(o.qty) || 1,
        name: typeof o.name === 'string' ? o.name : 'Item',
      };
    }
    return { qty: 1, name: 'Item' };
  });

  const deliveryLocation = data.deliveryLocation;
  const customerObj =
    data.customer && typeof data.customer === 'object'
      ? (data.customer as Record<string, unknown>)
      : null;
  const restaurantObj =
    data.restaurant && typeof data.restaurant === 'object'
      ? (data.restaurant as Record<string, unknown>)
      : null;
  const driverObj =
    data.driver && typeof data.driver === 'object'
      ? (data.driver as Record<string, unknown>)
      : null;
  const deliveryAddressRaw =
    customerObj && typeof customerObj.address === 'string'
      ? customerObj.address
      : null;
  const deliveryAddress =
    deliveryAddressRaw ||
    (deliveryLocation &&
    typeof deliveryLocation === 'object' &&
    typeof (deliveryLocation as { address?: unknown }).address === 'string'
      ? String((deliveryLocation as { address: string }).address)
      : typeof data.deliveryAddress === 'string'
        ? data.deliveryAddress
        : null);

  const restaurantIdRaw =
    restaurantObj && typeof restaurantObj.id === 'string'
      ? restaurantObj.id
      : null;
  const restaurantId =
    restaurantIdRaw ||
    (typeof data.restaurantId === 'string'
      ? data.restaurantId
      : typeof data.venueId === 'string'
        ? data.venueId
        : '');
  const restaurantNameRaw =
    restaurantObj && typeof restaurantObj.name === 'string'
      ? restaurantObj.name
      : null;
  const restaurantName = formatRestaurantName(
    restaurantNameRaw ||
      (typeof data.restaurantName === 'string' ? data.restaurantName : ''),
  );

  const etaMinutes =
    typeof data.estimatedDeliveryTime === 'number' && Number.isFinite(data.estimatedDeliveryTime)
      ? Math.round(data.estimatedDeliveryTime)
      : null;

  const totalPrice = Number(data.totalPrice ?? data.total ?? 0);

  const customerName =
    customerObj && typeof customerObj.name === 'string' && customerObj.name.trim()
      ? customerObj.name.trim()
      : typeof data.customerName === 'string' && data.customerName.trim()
        ? data.customerName.trim()
        : 'Customer';
  const customerId =
    customerObj && typeof customerObj.id === 'string'
      ? customerObj.id
      : typeof data.userId === 'string'
        ? data.userId
        : typeof data.customerId === 'string'
          ? data.customerId
          : null;
  const customerAvatar =
    customerObj && typeof customerObj.avatar === 'string'
      ? customerObj.avatar
      : null;

  const driverName =
    driverObj && typeof driverObj.name === 'string'
      ? driverObj.name
      : typeof data.driverName === 'string'
        ? data.driverName
        : null;

  return {
    id: d.id,
    restaurant: {
      id: restaurantId || null,
      name: restaurantName,
      image:
        restaurantObj && typeof restaurantObj.image === 'string'
          ? restaurantObj.image
          : restaurantId
            ? restaurantImages[restaurantId] ?? null
            : null,
      address:
        restaurantObj && typeof restaurantObj.address === 'string'
          ? formatAddress(restaurantObj.address)
          : null,
    },
    customer: {
      id: customerId,
      name: customerName,
      avatar: customerAvatar,
      address: formatAddress(deliveryAddress),
    },
    driver: {
      id:
        driverObj && typeof driverObj.id === 'string'
          ? driverObj.id
          : typeof data.driverId === 'string'
            ? data.driverId
            : null,
      name: driverName,
      avatar:
        driverObj && typeof driverObj.avatar === 'string' ? driverObj.avatar : null,
      phone:
        driverObj && typeof driverObj.phone === 'string'
          ? driverObj.phone
          : typeof data.driverPhone === 'string'
            ? data.driverPhone
            : null,
      vehicle:
        driverObj && typeof driverObj.vehicle === 'string'
          ? driverObj.vehicle
          : typeof data.driverVehicle === 'string'
            ? data.driverVehicle
            : null,
      status: driverSummaryFromDoc(data),
    },
    status,
    paymentStatus,
    totalPrice,
    etaMinutes,
    deliveryAddress: formatAddress(deliveryAddress),
    driverSummary: driverSummaryFromDoc(data),
    itemsPreview,
    participantCount,
    createdAtLabel: createdLabel(createdAtMs),
    section,
    listProgress: listProgressFromStatus(status),
  };
}

export default function MarketplaceOrdersScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { user, firestoreUserRole } = useAuth();
  const routingRole = normalizeRoleForRouting(firestoreUserRole);
  const [rows, setRows] = useState<MarketplaceOrdersFeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [listenerKey, setListenerKey] = useState(0);
  const [filter, setFilter] = useState<OrderHistoryFilter>('active');
  const restaurantImagesRef = useRef<Record<string, string | null>>({});
  const restaurantMetaRef = useRef<
    Record<string, { name: string | null; address: string | null; image: string | null }>
  >({});

  const uid = user?.uid ?? null;

  const enrichRestaurants = useCallback(async (docs: QueryDocumentSnapshot[]) => {
    const ids = new Set<string>();
    docs.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const rid =
        typeof data.restaurantId === 'string'
          ? data.restaurantId
          : typeof data.venueId === 'string'
            ? data.venueId
            : '';
      if (rid && restaurantImagesRef.current[rid] === undefined) {
        ids.add(rid);
      }
    });
    await Promise.all(
      [...ids].map(async (rid) => {
        try {
          const snap = await getDoc(doc(db, 'restaurants', rid));
          const d = snap.data() as Record<string, unknown> | undefined;
          const img =
            typeof d?.image === 'string'
              ? d.image
              : typeof d?.logoUrl === 'string'
                ? d.logoUrl
                : typeof d?.photoUrl === 'string'
                  ? d.photoUrl
                  : null;
          restaurantImagesRef.current[rid] = img;
          restaurantMetaRef.current[rid] = {
            name:
              typeof d?.name === 'string'
                ? d.name
                : typeof d?.restaurantName === 'string'
                  ? d.restaurantName
                  : null,
            address:
              typeof d?.address === 'string'
                ? d.address
                : d?.location &&
                    typeof d.location === 'object' &&
                    typeof (d.location as { address?: unknown }).address === 'string'
                  ? String((d.location as { address: string }).address)
                  : null,
            image: img,
          };
        } catch {
          restaurantImagesRef.current[rid] = null;
          restaurantMetaRef.current[rid] = { name: null, address: null, image: null };
        }
      }),
    );
  }, []);

  useEffect(() => {
    if (!isFocused) {
      setLoading(false);
      return undefined;
    }
    if (!uid) {
      setRows([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const ordersRef = collection(db, 'orders');
    const qParticipants = query(ordersRef, where('participants', 'array-contains', uid));
    const qUsers = query(ordersRef, where('users', 'array-contains', uid));
    const qUserId = query(ordersRef, where('userId', '==', uid));
    const qCustomerId = query(ordersRef, where('customerId', '==', uid));

    let listPart: QueryDocumentSnapshot[] = [];
    let listUsers: QueryDocumentSnapshot[] = [];
    let listUid: QueryDocumentSnapshot[] = [];
    let listCust: QueryDocumentSnapshot[] = [];
    let heardPart = false;
    let heardUsers = false;
    let heardUid = false;
    let heardCust = false;

    const onListenError = () => {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
    };

    let mergeDebounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleMerge = () => {
      if (mergeDebounce) clearTimeout(mergeDebounce);
      mergeDebounce = setTimeout(() => {
        mergeDebounce = null;
        void merge();
      }, 72);
    };

    const merge = async () => {
      if (!heardPart || !heardUsers || !heardUid || !heardCust) return;
      const map = new Map<string, QueryDocumentSnapshot>();
      [...listPart, ...listUsers, ...listUid, ...listCust].forEach((docSnap) =>
        map.set(docSnap.id, docSnap),
      );
      const merged = [...map.values()].filter((docSnap) =>
        shouldShowMobileOrder(docSnap.data() as Record<string, unknown>),
      ).sort((a, b) => {
        const ma = safeToMillis(a.data()?.createdAt) ?? 0;
        const mb = safeToMillis(b.data()?.createdAt) ?? 0;
        return mb - ma;
      });

      await enrichRestaurants(merged);

      const nextRows = merged.map((docSnap) => {
        const row = mapDocToFeedRow(docSnap, restaurantImagesRef.current);
        if (row.restaurant.id && restaurantMetaRef.current[row.restaurant.id]) {
          const meta = restaurantMetaRef.current[row.restaurant.id]!;
          row.restaurant = {
            ...row.restaurant,
            name: formatRestaurantName(row.restaurant.name || meta.name || ''),
            address: row.restaurant.address ?? (meta.address ? formatAddress(meta.address) : null),
            image: row.restaurant.image ?? meta.image ?? null,
          };
        }
        return row;
      });
      setRows(nextRows);
      setLoadError(false);
      setLoading(false);
      setRefreshing(false);
    };

    const unsubPart = onSnapshot(
      qParticipants,
      (snap) => {
        listPart = snap.docs;
        heardPart = true;
        scheduleMerge();
      },
      onListenError,
    );
    const unsubUsers = onSnapshot(
      qUsers,
      (snap) => {
        listUsers = snap.docs;
        heardUsers = true;
        scheduleMerge();
      },
      onListenError,
    );
    const unsubUid = onSnapshot(
      qUserId,
      (snap) => {
        listUid = snap.docs;
        heardUid = true;
        scheduleMerge();
      },
      onListenError,
    );
    const unsubCust = onSnapshot(
      qCustomerId,
      (snap) => {
        listCust = snap.docs;
        heardCust = true;
        scheduleMerge();
      },
      onListenError,
    );

    return () => {
      if (mergeDebounce) clearTimeout(mergeDebounce);
      unsubPart();
      unsubUsers();
      unsubUid();
      unsubCust();
    };
  }, [isFocused, uid, listenerKey, enrichRestaurants]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setLoadError(false);
    setTimeout(() => setRefreshing(false), 750);
  }, []);

  const retryListeners = useCallback(() => {
    setLoadError(false);
    setLoading(true);
    setListenerKey((k) => k + 1);
  }, []);

  const activeRows = useMemo(() => rows.filter((r) => r.section === 'active'), [rows]);
  const completedRows = useMemo(() => rows.filter((r) => r.section === 'completed'), [rows]);
  const cancelledRows = useMemo(() => rows.filter((r) => r.section === 'cancelled'), [rows]);
  const visibleRows =
    filter === 'active' ? activeRows : filter === 'completed' ? completedRows : cancelledRows;

  const handleOpen = useCallback(
    (orderId: string) => {
      router.push(orderDetailHref(routingRole, orderId) as never);
    },
    [router, routingRole],
  );

  const reportOrder = useCallback(
    (row: MarketplaceOrdersFeedRow) => {
      if (!user?.uid || !row.driver.id) {
        Alert.alert('Report order', 'Open order details to contact support about this order.');
        return;
      }
      Alert.alert('Report order', 'Report this order for moderator review?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            void submitReport({
              reporterId: user.uid,
              reportedUserId: row.driver.id!,
              contentId: reportContentIdOrder(row.id),
              reason: 'other',
              description: 'Order reported from order history.',
            }).then(
              () => Alert.alert('Report submitted', 'Our moderation team will review this order.'),
              () => Alert.alert('Report failed', 'Could not submit report. Please try again.'),
            );
          },
        },
      ]);
    },
    [user?.uid],
  );

  const handleSignIn = () => {
    router.push('/(auth)/login?redirectTo=/(tabs)/orders');
  };

  if (uid == null) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <GlassBar style={styles.headerBar}>
            <View style={styles.headerInner}>
              <Text style={styles.headerTitle}>Orders</Text>
              <Text style={styles.headerSub}>Sign in to see your activity</Text>
            </View>
          </GlassBar>
          <View style={styles.centerBlock}>
            <MaterialIcons name="receipt-long" size={48} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyTitle}>Your orders live here</Text>
            <Pressable style={styles.primaryBtn} onPress={handleSignIn}>
              <Text style={styles.primaryBtnText}>Sign in</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <GlassBar style={styles.headerBar}>
            <View style={styles.headerInner}>
              <Text style={styles.headerTitle}>Orders</Text>
            </View>
          </GlassBar>
          <View style={[styles.centerBlock, styles.flexCenter]}>
            <ActivityIndicator size="large" color={TAB_SPINNER} />
            <Text style={styles.loadingCaption}>Loading your orders…</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <GlassBar style={styles.headerBar}>
          <View style={styles.headerInner}>
            <Text style={styles.headerTitle}>Orders</Text>
            <Text style={styles.headerSub}>
              {loadError ? 'Connection issue' : `${rows.length} total`}
            </Text>
          </View>
        </GlassBar>
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={TAB_SPINNER}
              colors={[TAB_SPINNER]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {loadError ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                Could not sync orders. Pull to refresh or check your connection.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={retryListeners}>
                <Text style={styles.primaryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!rows.length && !loadError ? (
            <View style={styles.globalEmpty}>
              <MaterialIcons name="delivery-dining" size={52} color="rgba(255,255,255,0.18)" />
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySub}>Place an order and it will appear here instantly.</Text>
            </View>
          ) : (
            <>
              <View style={styles.filterRow}>
                {(['active', 'completed', 'cancelled'] as const).map((next) => (
                  <Pressable
                    key={next}
                    style={[styles.filterChip, filter === next && styles.filterChipActive]}
                    onPress={() => setFilter(next)}
                  >
                    <Text style={[styles.filterText, filter === next && styles.filterTextActive]}>
                      {next === 'active' ? 'Active' : next === 'completed' ? 'Completed' : 'Cancelled'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.sectionTitle}>
                {filter === 'active' ? 'Active' : filter === 'completed' ? 'Completed' : 'Cancelled'}
              </Text>
              {visibleRows.length ? (
                visibleRows.map((row) => (
                  <MarketplaceOrderCard
                    key={row.id}
                    row={row}
                    onPress={() => handleOpen(row.id)}
                    onReport={() => reportOrder(row)}
                  />
                ))
              ) : (
                <Text style={styles.emptySection}>
                  No {filter} orders
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090B' },
  safe: { flex: 1 },
  scrollFlex: { flex: 1 },
  glass: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  glassAndroid: { backgroundColor: 'rgba(18,22,30,0.92)' },
  headerBar: { marginHorizontal: 16, marginTop: 4, marginBottom: 14 },
  headerInner: { paddingHorizontal: 18, paddingVertical: 14 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { marginTop: 4, color: '#7D8493', fontSize: 14, fontWeight: '600' },
  centerBlock: { flex: 1, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  flexCenter: { justifyContent: 'center', alignItems: 'center' },
  loadingCaption: { marginTop: 14, color: '#B7BDC9', fontSize: 14, fontWeight: '600' },
  listContent: { paddingHorizontal: 18, paddingBottom: 40 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderColor: 'rgba(34,197,94,0.4)',
  },
  filterText: {
    color: 'rgba(255,255,255,0.58)',
    fontWeight: '800',
    fontSize: 13,
  },
  filterTextActive: { color: '#22C55E' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
  sectionTitleMuted: {
    fontSize: 18,
    fontWeight: '800',
    color: '#7D8493',
    marginTop: 22,
    marginBottom: 10,
  },
  emptySection: { fontSize: 14, color: '#B7BDC9', marginBottom: 6, fontWeight: '600' },
  emptySectionMuted: { fontSize: 14, color: 'rgba(255,255,255,0.38)', marginBottom: 6, fontWeight: '600' },
  primaryBtn: {
    marginTop: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  primaryBtnText: { color: '#A7F3D0', fontWeight: '700', fontSize: 16 },
  emptyTitle: {
    color: '#F1F5F9',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySub: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  banner: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    marginBottom: 16,
  },
  bannerText: { color: '#F59E0B', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  globalEmpty: { alignItems: 'center', paddingVertical: 36 },
});
