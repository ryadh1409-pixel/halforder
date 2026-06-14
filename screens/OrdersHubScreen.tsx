import { FoodShareHubCard } from '@/components/ordersHub/FoodShareHubCard';
import { MarketplaceOrderCard } from '@/components/orders/MarketplaceOrderCard';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { splitHubItems } from '@/lib/ordersHubStatus';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { useAuth } from '@/services/AuthContext';
import { subscribeFoodShareHub } from '@/services/ordersHub';
import { useMarketplaceOrdersFeed } from '@/hooks/useMarketplaceOrdersFeed';
import { customerOrderDetailHref } from '@/lib/customerOrderNavigation';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

function EmptyBlock({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.emptyBlock}>
      <Ionicons name="restaurant-outline" size={28} color="rgba(255,255,255,0.25)" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
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
            Food shares and marketplace orders — always one tap away.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Active food shares</Text>
        {hubLoading ? (
          <ActivityIndicator color={c.primary} style={{ marginVertical: 24 }} />
        ) : active.length === 0 ? (
          <EmptyBlock
            title="No active food shares yet."
            body="Looking for someone to share this meal? Join a card from Swipe."
          />
        ) : (
          active.map((item) => <FoodShareHubCard key={item.hubId} item={item} />)
        )}

        {completed.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Completed food shares</Text>
            {completed.map((item) => (
              <FoodShareHubCard key={item.hubId} item={item} />
            ))}
          </>
        ) : !hubLoading ? (
          <>
            <Text style={styles.sectionTitle}>Completed food shares</Text>
            <EmptyBlock
              title="No completed food shares yet."
              body="Finished meal shares will appear here."
            />
          </>
        ) : null}

        {cancelled.length > 0 ? (
          <>
            <Text style={styles.sectionTitleMuted}>Cancelled</Text>
            {cancelled.map((item) => (
              <FoodShareHubCard key={item.hubId} item={item} />
            ))}
          </>
        ) : null}

        <Text style={[styles.sectionTitle, styles.sectionGap]}>Regular orders</Text>
        {ordersLoading ? (
          <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
        ) : orderRows.length === 0 ? (
          <EmptyBlock
            title="No marketplace orders yet."
            body="Your HalfOrder deliveries and pickups will show up here."
          />
        ) : (
          orderRows.slice(0, 12).map((row) => (
            <MarketplaceOrderCard
              key={row.id}
              row={row}
              onPress={() => router.push(customerOrderDetailHref(row.id) as never)}
            />
          ))
        )}

        <Pressable
          style={styles.swipeLink}
          onPress={() => router.push(USER_ROUTES.hub as never)}
        >
          <Ionicons name="flame" size={16} color="#FF6B35" />
          <Text style={styles.swipeLinkText}>Discover meal shares on Swipe</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#06080C' },
  scroll: { padding: 20, paddingBottom: 120 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  header: { marginBottom: 18 },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: { fontSize: 30, fontWeight: '900', color: '#FFF', marginTop: 4 },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  sectionTitleMuted: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 16,
  },
  sectionGap: { marginTop: 24 },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 12,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  signInTitle: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  signInBody: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },
  cta: {
    marginTop: 8,
    backgroundColor: '#FF6B35',
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
    marginTop: 20,
    paddingVertical: 12,
  },
  swipeLinkText: { color: '#FF6B35', fontWeight: '800', fontSize: 13 },
});

export default OrdersHubScreen;
