import {
  MarketplaceOrderCard,
  type MarketplaceOrdersFeedRow,
} from '@/components/orders/MarketplaceOrderCard';
import { getOrderListSection } from '@/constants/orderStatus';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { normalizeDeliveryStatus } from '@/services/deliveryStatus';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TAB_SPINNER = '#34D399';

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
  const rawCreated = data.createdAt;
  let createdAtMs: number | null = null;
  if (
    rawCreated &&
    typeof rawCreated === 'object' &&
    'toMillis' in rawCreated &&
    typeof (rawCreated as { toMillis: () => number }).toMillis === 'function'
  ) {
    createdAtMs = (rawCreated as { toMillis: () => number }).toMillis();
  } else if (typeof rawCreated === 'number') {
    createdAtMs = rawCreated;
  }

  const status = typeof data.status === 'string' ? data.status : '—';
  const paymentStatus = typeof data.paymentStatus === 'string' ? data.paymentStatus : 'unpaid';
  const section = getOrderListSection(status);

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
  const deliveryAddress =
    deliveryLocation &&
    typeof deliveryLocation === 'object' &&
    typeof (deliveryLocation as { address?: unknown }).address === 'string'
      ? String((deliveryLocation as { address: string }).address)
      : typeof data.deliveryAddress === 'string'
        ? data.deliveryAddress
        : null;

  const restaurantId =
    typeof data.restaurantId === 'string'
      ? data.restaurantId
      : typeof data.venueId === 'string'
        ? data.venueId
        : '';
  const restaurantName =
    typeof data.restaurantName === 'string' && data.restaurantName.trim()
      ? data.restaurantName.trim()
      : typeof data.foodName === 'string' && String(data.foodName).trim()
        ? String(data.foodName)
        : 'Restaurant';

  const etaMinutes =
    typeof data.estimatedDeliveryTime === 'number' && Number.isFinite(data.estimatedDeliveryTime)
      ? Math.round(data.estimatedDeliveryTime)
      : null;

  const totalPrice = Number(data.totalPrice ?? data.total ?? 0);

  return {
    id: d.id,
    restaurantName,
    restaurantImageUrl: restaurantId ? restaurantImages[restaurantId] ?? null : null,
    status,
    paymentStatus,
    totalPrice,
    etaMinutes,
    deliveryAddress,
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
  const { user } = useAuth();
  const [rows, setRows] = useState<MarketplaceOrdersFeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [listenerKey, setListenerKey] = useState(0);
  const restaurantImagesRef = useRef<Record<string, string | null>>({});

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
        } catch {
          restaurantImagesRef.current[rid] = null;
        }
      }),
    );
  }, []);

  useEffect(() => {
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

    const merge = async () => {
      if (!heardPart || !heardUsers || !heardUid || !heardCust) return;
      const map = new Map<string, QueryDocumentSnapshot>();
      [...listPart, ...listUsers, ...listUid, ...listCust].forEach((docSnap) =>
        map.set(docSnap.id, docSnap),
      );
      const merged = [...map.values()].sort((a, b) => {
        const ta = a.data()?.createdAt;
        const tb = b.data()?.createdAt;
        const ma =
          ta && typeof ta === 'object' && 'toMillis' in ta
            ? (ta as { toMillis: () => number }).toMillis()
            : 0;
        const mb =
          tb && typeof tb === 'object' && 'toMillis' in tb
            ? (tb as { toMillis: () => number }).toMillis()
            : 0;
        return mb - ma;
      });

      await enrichRestaurants(merged);

      const nextRows = merged.map((docSnap) =>
        mapDocToFeedRow(docSnap, restaurantImagesRef.current),
      );
      nextRows.forEach((order) => {
        console.log('LIVE ORDER:', order.id, order.status);
      });
      setRows(nextRows);
      setLoadError(false);
      setLoading(false);
      setRefreshing(false);
    };

    const unsubPart = onSnapshot(
      qParticipants,
      async (snap) => {
        listPart = snap.docs;
        heardPart = true;
        await merge();
      },
      onListenError,
    );
    const unsubUsers = onSnapshot(
      qUsers,
      async (snap) => {
        listUsers = snap.docs;
        heardUsers = true;
        await merge();
      },
      onListenError,
    );
    const unsubUid = onSnapshot(
      qUserId,
      async (snap) => {
        listUid = snap.docs;
        heardUid = true;
        await merge();
      },
      onListenError,
    );
    const unsubCust = onSnapshot(
      qCustomerId,
      async (snap) => {
        listCust = snap.docs;
        heardCust = true;
        await merge();
      },
      onListenError,
    );

    return () => {
      unsubPart();
      unsubUsers();
      unsubUid();
      unsubCust();
    };
  }, [uid, listenerKey, enrichRestaurants]);

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

  const handleOpen = useCallback(
    (orderId: string) => {
      router.push(`/order/${orderId}`);
    },
    [router],
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
              <Text style={styles.sectionTitle}>Active</Text>
              {activeRows.length ? (
                activeRows.map((row) => (
                  <MarketplaceOrderCard key={row.id} row={row} onPress={() => handleOpen(row.id)} />
                ))
              ) : (
                <Text style={styles.emptySection}>No active orders</Text>
              )}

              <Text style={styles.sectionTitleMuted}>Completed</Text>
              {completedRows.length ? (
                completedRows.map((row) => (
                  <MarketplaceOrderCard key={row.id} row={row} onPress={() => handleOpen(row.id)} />
                ))
              ) : (
                <Text style={styles.emptySectionMuted}>No completed orders</Text>
              )}

              <Text style={styles.sectionTitleMuted}>Cancelled</Text>
              {cancelledRows.length ? (
                cancelledRows.map((row) => (
                  <MarketplaceOrderCard key={row.id} row={row} onPress={() => handleOpen(row.id)} />
                ))
              ) : (
                <Text style={styles.emptySectionMuted}>No cancelled orders</Text>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06080C' },
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
  headerTitle: { color: '#F8FAFC', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { marginTop: 4, color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600' },
  centerBlock: { flex: 1, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  flexCenter: { justifyContent: 'center', alignItems: 'center' },
  loadingCaption: { marginTop: 14, color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  listContent: { paddingHorizontal: 18, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
  sectionTitleMuted: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 22,
    marginBottom: 10,
  },
  emptySection: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontWeight: '600' },
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
  bannerText: { color: '#FDE68A', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  globalEmpty: { alignItems: 'center', paddingVertical: 36 },
});
