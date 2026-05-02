import SwipeWrapper from '@/components/SwipeWrapper';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FoodTruck = {
  id: string;
  name: string;
  image: string;
  cuisine: string;
  rating: number;
};

const MOCK_TRUCKS: FoodTruck[] = [
  {
    id: 'tacos-el-jefe',
    name: 'Tacos El Jefe',
    image:
      'https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=1200&q=80',
    cuisine: 'Mexican',
    rating: 4.6,
  },
  {
    id: 'curry-express',
    name: 'Curry Express',
    image:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=80',
    cuisine: 'Indian',
    rating: 4.5,
  },
  {
    id: 'burger-bus',
    name: 'Burger Bus',
    image:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
    cuisine: 'American',
    rating: 4.4,
  },
];

export default function FoodTrucksScreen() {
  const router = useRouter();

  return (
    <SwipeWrapper currentIndex={3}>
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={MOCK_TRUCKS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Food Trucks Near You</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={{ uri: item.image }} style={styles.image} />
            <View style={styles.cardBody}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.cuisine}</Text>
              <Text style={styles.rating}>⭐ {item.rating.toFixed(1)}</Text>
              <Pressable
                style={styles.button}
                onPress={() => router.push(`/food-truck/${item.id}` as never)}
              >
                <Text style={styles.buttonText}>View Menu</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
    </SwipeWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 10 },
  title: { fontSize: 30, fontWeight: '800', color: '#0F172A' },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  image: { width: '100%', height: 170, backgroundColor: '#E2E8F0' },
  cardBody: { padding: 14 },
  name: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  meta: { marginTop: 5, fontSize: 14, color: '#64748B', fontWeight: '600' },
  rating: { marginTop: 6, fontSize: 14, color: '#334155', fontWeight: '700' },
  button: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
