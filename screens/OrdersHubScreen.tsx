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

function CompactEmpty({ label }: { label: string }) {
  return (
    <Text style={styles.compactEmpty} numberOfLines={1}>
      {label}
    </Text>
  );
}

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
        <View style={styles.header}>
          <Text style={styles.kicker}>Your activity</Text>
          <Text style={styles.title}>Orders</Text>
          <Text style={styles.subtitle}>
            HalfOrder shares and FullOrder deliveries in one place.
          </Text>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>HalfOrder</Text>
          {hubLoading ? (
            <ActivityIndicator color={c.primary} style={styles.sectionLoader} />
          ) : active.length === 0 ? (
            <CompactEmpty label="No active orders" />
          ) : (
            active.map((item) => <FoodShareHubCard key={item.hubId} item={item} />)
          )}
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>HalfOrder History</Text>
          {hubLoading ? null : completed.length === 0 ? (
            <CompactEmpty label="No past orders" />
          ) : (
            completed.map((item) => (
              <FoodShareHubCard key={item.hubId} item={item} />
            ))
          )}
        </View>

        {cancelled.length > 0 ? (
          <View style={styles.sectionBlockMuted}>
            <Text style={styles.sectionTitleMuted}>Cancelled</Text>
            {cancelled.map((item) => (
              <FoodShareHubCard key={item.hubId} item={item} />
            ))}
          </View>
        ) : null}

        <View style={[styles.sectionBlock, styles.fullOrderBlock]}>
          <Text style={styles.sectionTitle}>FullOrder</Text>
          {ordersLoading ? (
            <ActivityIndicator color={c.primary} style={styles.sectionLoader} />
          ) : orderRows.length === 0 ? (
            <CompactEmpty label="No FullOrder deliveries yet" />
          ) : (
            orderRows.slice(0, 12).map((row) => (
              <MarketplaceOrderCard
                key={row.id}
                row={row}
                onPress={() => router.push(customerOrderDetailHref(row.id) as never)}
                onReport={() => reportOrder(row)}
              />
            ))
          )}
        </View>

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
  header: { marginBottom: 28 },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B929E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 6,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: '#A8AFBC',
    marginTop: 8,
    fontWeight: '500',
  },
  sectionBlock: {
    marginBottom: 28,
  },
  sectionBlockMuted: {
    marginBottom: 28,
  },
  fullOrderBlock: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  sectionTitleMuted: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7D8493',
    letterSpacing: 0.4,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sectionLoader: { marginVertical: 12, alignSelf: 'flex-start' },
  compactEmpty: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7D8493',
    marginBottom: 4,
    paddingVertical: 2,
  },
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
