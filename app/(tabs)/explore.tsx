import { FeaturedSection } from '@/components/home/FeaturedSection';
import { HomeHeader } from '@/components/home/HomeHeader';
import { UE } from '@/constants/uberEatsTheme';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import { useHomeRestaurants } from '@/hooks/useHomeRestaurants';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BROWSE_SECTIONS = [
  { title: 'Featured near you', subtitle: 'Top picks near you' },
  { title: 'Places you might like', subtitle: undefined },
  { title: 'Popular now', subtitle: 'Trending this week' },
  { title: 'Late night', subtitle: 'Open now' },
] as const;

/** Browse tab — full-width discovery rails without duplicate home chrome. */
export default function ExploreTab() {
  const router = useRouter();
  const { addressLine } = useHomeMarketplaceLocation();
  const { restaurants, loading } = useHomeRestaurants();

  const openRestaurant = useCallback(
    (id: string) => {
      router.push(`/restaurant-menu/${encodeURIComponent(id)}` as never);
    },
    [router],
  );

  const slice = (start: number, count: number) =>
    restaurants.slice(start, start + count);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <HomeHeader
        addressLine={addressLine}
        onAddressPress={() => router.push('/(tabs)/profile' as never)}
        onNotificationsPress={() => router.push('/(tabs)/profile' as never)}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.headline}>Browse</Text>
        <Text style={styles.sub}>
          Discover restaurants, groceries, and more
        </Text>
        {loading && restaurants.length === 0 ? (
          <ActivityIndicator style={styles.loader} color={UE.text} />
        ) : (
          BROWSE_SECTIONS.map((sec, i) => (
            <FeaturedSection
              key={sec.title}
              title={sec.title}
              subtitle={sec.subtitle}
              restaurants={slice(i * 3, 8)}
              onRestaurantPress={openRestaurant}
            />
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UE.bg },
  content: { paddingBottom: 24 },
  headline: {
    fontSize: 32,
    fontWeight: '900',
    color: UE.text,
    letterSpacing: -0.5,
    paddingHorizontal: 16,
  },
  sub: {
    fontSize: 15,
    fontWeight: '600',
    color: UE.textMuted,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
  },
  loader: { marginTop: 48 },
});
