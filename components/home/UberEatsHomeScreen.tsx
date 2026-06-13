import { FeaturedSection } from '@/components/home/FeaturedSection';
import { HomeHeader } from '@/components/home/HomeHeader';
import { PromoBannerCarousel } from '@/components/home/PromoBannerCarousel';
import { HomeFeedSkeleton } from '@/components/home/HomeFeedSkeleton';
import { UE } from '@/constants/uberEatsTheme';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import { useHomeRestaurants } from '@/hooks/useHomeRestaurants';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Uber Eats–style marketplace home — Firestore realtime restaurants, horizontal rails.
 */
export function UberEatsHomeScreen() {
  const router = useRouter();
  const { addressLine, refreshLocation, locationLoading } = useHomeMarketplaceLocation();
  const { restaurants, loading, error } = useHomeRestaurants();
  const [refreshing, setRefreshing] = useState(false);

  const featured = useMemo(() => restaurants.slice(0, 8), [restaurants]);
  const popular = useMemo(
    () =>
      [...restaurants]
        .filter((r) => r.reviewCount > 0 && r.rating != null)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 10),
    [restaurants],
  );
  const mightLike = useMemo(() => restaurants.slice(2, 12), [restaurants]);
  const offers = useMemo(
    () => restaurants.filter((r) => r.promoLabel != null).slice(0, 10),
    [restaurants],
  );

  const openRestaurant = useCallback(
    (id: string) => {
      router.push(`/restaurant-menu/${encodeURIComponent(id)}` as never);
    },
    [router],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshLocation().finally(() => setRefreshing(false));
  }, [refreshLocation]);

  const onAddressPress = useCallback(() => {
    router.push('/(tabs)/profile' as never);
  }, [router]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <HomeHeader
        addressLine={addressLine}
        onAddressPress={onAddressPress}
        onNotificationsPress={() =>
          router.push('/(tabs)/profile' as never)
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || locationLoading}
            onRefresh={onRefresh}
            tintColor={UE.text}
          />
        }
        contentContainerStyle={styles.content}
      >
        <PromoBannerCarousel />

        {loading && restaurants.length === 0 ? <HomeFeedSkeleton /> : null}

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {!loading || restaurants.length > 0 ? (
          <>
            <FeaturedSection
              title="Featured near you"
              restaurants={featured}
              onRestaurantPress={openRestaurant}
            />
            <FeaturedSection
              title="Places you might like"
              restaurants={mightLike}
              onRestaurantPress={openRestaurant}
            />
            {popular.length > 0 ? (
              <FeaturedSection
                title="Popular now"
                subtitle="Highest rated with reviews"
                restaurants={popular}
                onRestaurantPress={openRestaurant}
              />
            ) : null}
            {offers.length > 0 ? (
              <FeaturedSection
                title="Offers for you"
                restaurants={offers}
                onRestaurantPress={openRestaurant}
              />
            ) : null}

            {!loading && restaurants.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No restaurants found</Text>
                <Text style={styles.emptySub}>Check back later for new spots near you.</Text>
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
