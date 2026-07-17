import { FeaturedSection } from '@/components/home/FeaturedSection';
import { HomeHeader } from '@/components/home/HomeHeader';
import { PromoBannerCarousel } from '@/components/home/PromoBannerCarousel';
import { HomeFeedSkeleton } from '@/components/home/HomeFeedSkeleton';
import { UE } from '@/constants/uberEatsTheme';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import { useFoodShareUnreadCount } from '@/hooks/useFoodShareInbox';
import { useHomeBanners } from '@/hooks/useHomeBanners';
import { useHomeRestaurants } from '@/hooks/useHomeRestaurants';
import { auth } from '@/services/firebase';
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
  const { banners, settings: bannerSettings, loading: bannersLoading } = useHomeBanners();
  const unreadNotifications = useFoodShareUnreadCount(auth.currentUser?.uid);
  const [refreshing, setRefreshing] = useState(false);

  const showBanners = bannerSettings.visible && banners.length > 0;
  const showBannerSkeleton =
    bannerSettings.visible && bannersLoading && banners.length === 0;

  const onBannerNavigate = useCallback(
    (destination: string) => {
      router.push(destination as never);
    },
    [router],
  );

  const featured = useMemo(() => restaurants.slice(0, 8), [restaurants]);

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
        onNotificationsPress={() => router.push('/inbox' as never)}
        unreadNotifications={unreadNotifications}
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
        {showBanners ? (
          <PromoBannerCarousel
            banners={banners}
            onNavigate={onBannerNavigate}
          />
        ) : null}

        {loading && restaurants.length === 0 ? (
          <HomeFeedSkeleton showBanner={showBannerSkeleton} />
        ) : null}

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {!loading || restaurants.length > 0 ? (
          <>
            <FeaturedSection
              title="Featured near you"
              restaurants={featured}
              onRestaurantPress={openRestaurant}
            />

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
