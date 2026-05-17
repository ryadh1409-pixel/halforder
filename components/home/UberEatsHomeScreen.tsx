import {
  CategoryChipsRow,
  type HomeCategory,
} from '@/components/home/CategoryChipsRow';
import { FeaturedSection } from '@/components/home/FeaturedSection';
import { HomeHeader } from '@/components/home/HomeHeader';
import { PromoBannerCarousel } from '@/components/home/PromoBannerCarousel';
import { HomeFeedSkeleton } from '@/components/home/HomeFeedSkeleton';
import { UE } from '@/constants/uberEatsTheme';
import { useHomeRestaurants } from '@/hooks/useHomeRestaurants';
import type { HomeRestaurant } from '@/types/homeRestaurant';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function filterByCategory(
  list: HomeRestaurant[],
  cat: HomeCategory,
): HomeRestaurant[] {
  if (cat === 'All') return list;
  if (cat === 'Pickup') return list;
  if (cat === 'Offers') return list.filter((r) => r.promoLabel != null);
  const needle = cat.toLowerCase();
  return list.filter(
    (r) =>
      r.cuisine?.toLowerCase().includes(needle) ||
      r.name.toLowerCase().includes(needle) ||
      (cat === 'Grocery' && r.cuisine?.toLowerCase().includes('grocery')),
  );
}

/**
 * Uber Eats–style marketplace home — Firestore realtime restaurants, horizontal rails.
 */
export function UberEatsHomeScreen() {
  const router = useRouter();
  const { restaurants, loading, error } = useHomeRestaurants();
  const [category, setCategory] = useState<HomeCategory>('All');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () => filterByCategory(restaurants, category),
    [restaurants, category],
  );

  const featured = useMemo(() => filtered.slice(0, 8), [filtered]);
  const popular = useMemo(
    () => [...filtered].sort((a, b) => b.rating - a.rating).slice(0, 10),
    [filtered],
  );
  const mightLike = useMemo(() => filtered.slice(2, 12), [filtered]);
  const offers = useMemo(
    () =>
      filtered.filter((r) => r.promoLabel || r.deliveryFee === 0).slice(0, 10),
    [filtered],
  );

  const openRestaurant = useCallback(
    (id: string) => {
      router.push(`/restaurant-menu/${encodeURIComponent(id)}` as never);
    },
    [router],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <HomeHeader
        addressLine="123 Queen St W · Toronto, ON"
        onAddressPress={() =>
          Alert.alert('Delivery address', 'Wire to users/{uid} addresses.')
        }
        onNotificationsPress={() =>
          Alert.alert('Notifications', 'Inbox coming soon.')
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={UE.text}
          />
        }
        contentContainerStyle={styles.content}
      >
        <CategoryChipsRow active={category} onChange={setCategory} />
        <PromoBannerCarousel />

        {loading && restaurants.length === 0 ? <HomeFeedSkeleton /> : null}

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {!loading || restaurants.length > 0 ? (
          <>
            <FeaturedSection
              title="Featured near you"
              subtitle="Sponsored picks in your area"
              restaurants={featured}
              onRestaurantPress={openRestaurant}
            />
            <FeaturedSection
              title="Places you might like"
              restaurants={mightLike}
              onRestaurantPress={openRestaurant}
            />
            <FeaturedSection
              title="Popular now"
              subtitle="Top rated this week"
              restaurants={popular}
              onRestaurantPress={openRestaurant}
            />
            {offers.length > 0 ? (
              <FeaturedSection
                title="Offers for you"
                restaurants={offers}
                onRestaurantPress={openRestaurant}
              />
            ) : null}

            {!loading && filtered.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No restaurants found</Text>
                <Text style={styles.emptySub}>
                  Try another category or check back later.
                </Text>
              </View>
            ) : null}

            <View style={{ height: 120 }} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UE.bg },
  content: { flexGrow: 1, paddingBottom: UE.spaceBlock },
  err: {
    marginHorizontal: 16,
    marginBottom: 12,
    color: UE.promo,
    fontWeight: '700',
    fontSize: 14,
  },
  empty: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 24,
    borderRadius: UE.radiusXL,
    backgroundColor: UE.surface,
    borderWidth: 1,
    borderColor: UE.borderLight,
  },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: UE.text },
  emptySub: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: UE.textMuted,
  },
});
