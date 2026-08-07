import { FoodShareHubCard } from '@/components/ordersHub/FoodShareHubCard';
import { MarketplaceOrderCard } from '@/components/orders/MarketplaceOrderCard';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { splitHubItems } from '@/lib/ordersHubStatus';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { useAuth } from '@/services/AuthContext';
import { subscribeFoodShareHub } from '@/services/ordersHub';
import { useMarketplaceOrdersFeed } from '@/hooks/useMarketplaceOrdersFeed';
import { customerOrderDetailHref } from '@/lib/customerOrderNavigation';
import { reportContentIdOrder, submitReport } from '@/services/reports';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FoodShareHubItem } from '@/lib/ordersHubStatus';

const c = theme.colors;

export function OrdersHubScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [hubItems, setHubItems] = useState<FoodShareHubItem[]>([]);
  const [hubLoading, setHubLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { rows: orderRows, loading: ordersLoading } = useMarketplaceOrdersFeed(uid);

  const reportOrder = (row: (typeof orderRows)[number]) => {
    if (!uid || !row.driver.id) {
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
            reporterId: uid,
            reportedUserId: row.driver.id!,
            contentId: reportContentIdOrder(row.id),
            reason: 'other',
            description: 'Order reported from Orders Hub.',
          }).then(
            () => Alert.alert('Report submitted', 'Our moderation team will review this order.'),
            () => Alert.alert('Report failed', 'Could not submit report. Please try again.'),
          );
        },
      },
    ]);
  };

  useEffect(() => {
    if (!uid) {
      setHubItems([]);
      setHubLoading(false);
      return undefined;
    }
    setHubLoading(true);
    const unsub = subscribeFoodShareHub(
      (items) => {
        setHubItems(items);
        setHubLoading(false);
        setRefreshing(false);
      },
      () => {
        setHubLoading(false);
        setRefreshing(false);
      },
    );
    return unsub;
  }, [uid]);

  const { active, completed, cancelled } = useMemo(
    () => splitHubItems(hubItems),
    [hubItems],
  );

  // Split FullOrder rows by section using the existing `section` field
  const activeOrderRows = useMemo(
    () => orderRows.filter((r) => r.section === 'active'),
    [orderRows],
  );
  const completedOrderRows = useMemo(
    () => orderRows.filter((r) => r.section === 'completed'),
    [orderRows],
  );
  const cancelledOrderRows = useMemo(
    () => orderRows.filter((r) => r.section === 'cancelled'),
    [orderRows],
  );

  const isLoading = hubLoading || ordersLoading;
  const hasActiveItems = active.length > 0 || activeOrderRows.length > 0;
  const hasPastItems = completed.length > 0 || completedOrderRows.length > 0;
  const hasCancelledItems = cancelled.length > 0 || cancelledOrderRows.length > 0;
  const hasAnyItems = hasActiveItems || hasPastItems || hasCancelledItems;

  if (!uid) {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeCinematicBackground />
        <View style={styles.centered}>
          <Text style={styles.signInTitle}>Orders Hub</Text>
          <Text style={styles.signInBody}>Sign in to track food shares and orders.</Text>
          <Pressable
            style={styles.cta}
            onPress={() => router.push('/(auth)/login?redirectTo=/(tabs)/search' as never)}
          >
            <Text style={styles.ctaText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SwipeCinematicBackground />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.primary}
            onRefresh={() => setRefreshing(true)}
          />
        }
      >
        {/* ── Page Header ── */}
        <View style={styles.header}>
          <Text style={styles.kicker}>Your activity</Text>
          <Text style={styles.title}>Orders</Text>
          <Text style={styles.subtitle}>
            HalfOrder shares and FullOrder deliveries in one place.
          </Text>
        </View>

        {/* ── Loading skeleton ── */}
        {isLoading && !hasAnyItems && (
          <View style={styles.globalLoader}>
            <ActivityIndicator color={c.primary} size="small" />
          </View>
        )}

        {/* ── ACTIVE ORDERS ── */}
        {(hasActiveItems || (isLoading && !hasPastItems && !hasCancelledItems)) && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>Active Orders</Text>
            </View>

            {/* HalfOrder active */}
            {active.length > 0 && (
              <View style={styles.subGroup}>
                {(active.length > 0 && activeOrderRows.length > 0) && (
                  <Text style={styles.subLabel}>HalfOrder</Text>
                )}
                {active.map((item) => (
                  <FoodShareHubCard key={item.hubId} item={item} />
                ))}
              </View>
            )}
            {hubLoading && active.length === 0 && (
              <ActivityIndicator color={c.primary} size="small" style={styles.inlineLoader} />
            )}

            {/* FullOrder active */}
            {activeOrderRows.length > 0 && (
              <View style={styles.subGroup}>
                {(active.length > 0 && activeOrderRows.length > 0) && (
                  <Text style={styles.subLabel}>FullOrder</Text>
                )}
                {activeOrderRows.slice(0, 12).map((row) => (
                  <MarketplaceOrderCard
                    key={row.id}
                    row={row}
                    onPress={() => router.push(customerOrderDetailHref(row.id) as never)}
                    onReport={() => reportOrder(row)}
                  />
                ))}
              </View>
            )}
            {ordersLoading && activeOrderRows.length === 0 && (
              <ActivityIndicator color={c.primary} size="small" style={styles.inlineLoader} />
            )}
          </View>
        )}

        {/* ── PAST ORDERS ── */}
        {hasPastItems && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionDot, styles.sectionDotMuted]} />
              <Text style={styles.sectionTitle}>Past Orders</Text>
            </View>

            {/* HalfOrder completed */}
            {completed.length > 0 && (
              <View style={styles.subGroup}>
                {(completed.length > 0 && completedOrderRows.length > 0) && (
                  <Text style={styles.subLabel}>HalfOrder</Text>
                )}
                {completed.map((item) => (
                  <FoodShareHubCard key={item.hubId} item={item} />
                ))}
              </View>
            )}

            {/* FullOrder completed */}
            {completedOrderRows.length > 0 && (
              <View style={styles.subGroup}>
                {(completed.length > 0 && completedOrderRows.length > 0) && (
                  <Text style={styles.subLabel}>FullOrder</Text>
                )}
                {completedOrderRows.slice(0, 12).map((row) => (
                  <MarketplaceOrderCard
                    key={row.id}
                    row={row}
                    onPress={() => router.push(customerOrderDetailHref(row.id) as never)}
                    onReport={() => reportOrder(row)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── CANCELLED ── */}
        {hasCancelledItems && (
          <View style={styles.sectionMuted}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionDot, styles.sectionDotCancelled]} />
              <Text style={styles.sectionTitleMuted}>Cancelled</Text>
            </View>

            {cancelled.length > 0 && (
              <View style={styles.subGroup}>
                {(cancelled.length > 0 && cancelledOrderRows.length > 0) && (
                  <Text style={styles.subLabel}>HalfOrder</Text>
                )}
                {cancelled.map((item) => (
                  <FoodShareHubCard key={item.hubId} item={item} />
                ))}
              </View>
            )}

            {cancelledOrderRows.length > 0 && (
              <View style={styles.subGroup}>
                {(cancelled.length > 0 && cancelledOrderRows.length > 0) && (
                  <Text style={styles.subLabel}>FullOrder</Text>
                )}
                {cancelledOrderRows.slice(0, 8).map((row) => (
                  <MarketplaceOrderCard
                    key={row.id}
                    row={row}
                    onPress={() => router.push(customerOrderDetailHref(row.id) as never)}
                    onReport={() => reportOrder(row)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Empty state ── */}
        {!isLoading && !hasAnyItems && (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={40} color="#3D4351" />
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyBody}>
              Your HalfOrder shares and FullOrder deliveries will appear here.
            </Text>
          </View>
        )}

        {/* ── Swipe CTA ── */}
        <Pressable
          style={styles.swipeLink}
          onPress={() => router.push(USER_ROUTES.hub as never)}
        >
          <Ionicons name="flame" size={16} color="#A855F7" />
          <Text style={styles.swipeLinkText}>Discover meal shares on Swipe</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0816' },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },

  // ── Header ──
  header: { marginBottom: 32 },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 4,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#7D8493',
    marginTop: 6,
    fontWeight: '500',
  },

  // ── Section containers ──
  section: {
    marginBottom: 36,
  },
  sectionMuted: {
    marginBottom: 32,
  },

  // ── Section headers ──
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#A855F7',
  },
  sectionDotMuted: {
    backgroundColor: '#4B5563',
  },
  sectionDotCancelled: {
    backgroundColor: '#374151',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  sectionTitleMuted: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: -0.2,
  },

  // ── Sub-groups (HalfOrder / FullOrder within a section) ──
  subGroup: {
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 10,
  },

  // ── Loaders ──
  globalLoader: {
    paddingVertical: 32,
    alignItems: 'flex-start',
  },
  inlineLoader: {
    marginVertical: 8,
    alignSelf: 'flex-start',
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 56,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4B5563',
    marginTop: 4,
  },
  emptyBody: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
    maxWidth: 280,
  },

  // ── Sign-in state ──
  signInTitle: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  signInBody: { fontSize: 14, color: '#B7BDC9', textAlign: 'center' },
  cta: {
    marginTop: 8,
    backgroundColor: '#A855F7',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  ctaText: { color: '#FFF', fontWeight: '800', fontSize: 15 },

  // ── Swipe CTA ──
  swipeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
  },
  swipeLinkText: { color: '#A855F7', fontWeight: '800', fontSize: 13 },
});

export default OrdersHubScreen;
