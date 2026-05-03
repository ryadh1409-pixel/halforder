import SwipeWrapper from '@/components/SwipeWrapper';
import { db } from '@/services/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { Image as ExpoImage } from 'expo-image';
import { collection, getDocs } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RestaurantRow = {
  id: string;
  name?: string;
  location?: string;
  logo?: string;
  isOpen?: boolean;
  [key: string]: unknown;
};

const GAP = 16;

export default function HomeFoodTrucksTab() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRestaurants = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'restaurants'));
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as RestaurantRow[];
      data.sort((a, b) =>
        String(a.name ?? 'Venue').localeCompare(String(b.name ?? 'Venue')),
      );
      setRestaurants(data);
    } catch {
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchRestaurants();
    }, [fetchRestaurants]),
  );

  return (
    <SwipeWrapper currentIndex={4}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <FlatList
          data={restaurants}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          removeClippedSubviews
          initialNumToRender={8}
          ListHeaderComponent={
            <View style={[styles.header, { marginBottom: GAP }]}>
              <Text style={styles.title}>Food Trucks</Text>
              <Text style={styles.subtitle}>Live from Firestore</Text>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.emptyText}>Loading…</Text>
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No venues yet</Text>
                <Text style={styles.emptyText}>
                  Save your venue from the Host dashboard to appear here.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const name =
              typeof item.name === 'string' && item.name.trim()
                ? item.name.trim()
                : 'Venue';
            const location =
              typeof item.location === 'string' && item.location.trim()
                ? item.location.trim()
                : 'Location not listed';
            const logo = typeof item.logo === 'string' && item.logo.trim() ? item.logo : null;
            const open = item.isOpen !== false;
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/food-truck/${item.id}` as never)}
              >
                {logo ? (
                  <ExpoImage
                    source={{ uri: logo }}
                    style={styles.image}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={item.id}
                  />
                ) : (
                  <View style={[styles.image, styles.imagePh]}>
                    <Text style={styles.imagePhText}>{name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.badgeRow}>
                  <View style={[styles.pill, open ? styles.pillOpen : styles.pillClosed]}>
                    <Text style={[styles.pillText, open ? styles.pillOpenT : styles.pillClosedT]}>
                      {open ? 'Open' : 'Closed'}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.name} numberOfLines={2}>
                    {name}
                  </Text>
                  <Text style={styles.location} numberOfLines={2}>
                    {location}
                  </Text>
                  <View style={styles.btn}>
                    <Text style={styles.btnText}>View menu</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </SwipeWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: GAP, paddingBottom: 32, flexGrow: 1 },
  header: {},
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 8, fontSize: 14, color: '#64748B', fontWeight: '600' },
  emptyWrap: { paddingVertical: 48, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  emptyText: { marginTop: 8, fontSize: 14, color: '#64748B', textAlign: 'center', maxWidth: 300 },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: GAP,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  image: { width: '100%', height: 168, backgroundColor: '#E2E8F0' },
  imagePh: { alignItems: 'center', justifyContent: 'center' },
  imagePhText: { fontSize: 42, fontWeight: '800', color: '#94A3B8' },
  badgeRow: { paddingHorizontal: 12, paddingTop: 10, marginTop: -46, flexDirection: 'row' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillOpen: { backgroundColor: 'rgba(22, 163, 74, 0.95)' },
  pillClosed: { backgroundColor: 'rgba(71, 85, 105, 0.92)' },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillOpenT: { color: '#FFFFFF' },
  pillClosedT: { color: '#F1F5F9' },
  cardBody: { padding: GAP },
  name: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  location: { marginTop: 8, fontSize: 14, color: '#64748B', fontWeight: '600' },
  btn: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
