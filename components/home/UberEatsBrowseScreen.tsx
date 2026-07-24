import { RestaurantCard } from '@/components/home/RestaurantCard';
import { UE } from '@/constants/uberEatsTheme';
import { useHomeRestaurants } from '@/hooks/useHomeRestaurants';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, StyleSheet, Text, View } from 'react-native';
import { AppTextInput } from '../AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

const CARD_W = Dimensions.get('window').width - 32;

/** Browse tab — search + vertical restaurant discovery (Uber Eats Browse). */
export function UberEatsBrowseScreen() {
  const router = useRouter();
  const { restaurants, loading } = useHomeRestaurants();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return restaurants;
    return restaurants.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.cuisine?.toLowerCase().includes(q),
    );
  }, [restaurants, query]);

  const openRestaurant = useCallback(
    (id: string) => {
      router.push(`/restaurant-menu/${encodeURIComponent(id)}` as never);
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>Search</Text>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={UE.textMuted} />
        <AppTextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search restaurants or cuisines"
          placeholderTextColor={UE.textMuted}
          style={styles.search}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      {loading && restaurants.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={UE.text} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <RestaurantCard
                restaurant={item}
                width={CARD_W}
                promotionDestination="listing"
                onPress={() => openRestaurant(item.id)}
              />
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No matches for &quot;{query}&quot;</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UE.bg },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: UE.text,
    paddingHorizontal: 16,
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: UE.radiusPill,
    backgroundColor: UE.surface,
    borderWidth: 1,
    borderColor: UE.borderLight,
    gap: 10,
  },
  search: { flex: 1, fontSize: 16, fontWeight: '600', color: UE.text },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  row: { marginBottom: 20 },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    fontWeight: '600',
    color: UE.textMuted,
  },
});
