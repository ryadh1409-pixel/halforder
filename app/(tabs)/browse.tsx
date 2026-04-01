import { theme } from '@/constants/theme';
import { joinFoodCard, subscribeWaitingFoodCards, type FoodCard } from '@/services/foodCards';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const D = {
  bg: '#06080C',
  card: '#11161F',
  border: 'rgba(255,255,255,0.1)',
  text: '#F8FAFC',
  muted: 'rgba(248,250,252,0.55)',
};

export default function BrowseScreen() {
  const router = useRouter();
  const [cards, setCards] = useState<FoodCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeWaitingFoodCards((rows) => {
      setCards(rows);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const onJoin = async (id: string) => {
    setJoiningId(id);
    try {
      const result = await joinFoodCard(id);
      if (result.matched) {
        router.push(`/match/${id}` as const);
      }
    } catch {
      // keep screen stable
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Swipe & Join</Text>
        <Text style={styles.subtitle}>Admin-curated food cards nearby</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#34D399" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {cards.length === 0 ? (
            <Text style={styles.empty}>No active cards right now.</Text>
          ) : (
            cards.map((card) => (
              <View key={card.id} style={styles.card}>
                <Image source={{ uri: card.image }} style={styles.hero} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.meta}>{card.restaurantName}</Text>
                  <Text style={styles.meta}>
                    ${card.splitPrice.toFixed(2)} each · total ${card.price.toFixed(2)}
                  </Text>
                  <Text style={styles.meta}>Expires in 45 minutes</Text>
                  <TouchableOpacity
                    style={styles.joinBtn}
                    disabled={joiningId === card.id}
                    onPress={() => onJoin(card.id)}
                  >
                    {joiningId === card.id ? (
                      <ActivityIndicator color="#0B1A15" />
                    ) : (
                      <Text style={styles.joinText}>❤️ Join</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },
  header: { paddingHorizontal: theme.spacing.screen, paddingVertical: 14 },
  title: { color: D.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: D.muted, marginTop: 6 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.spacing.screen, paddingBottom: 32 },
  empty: { color: D.muted, textAlign: 'center', marginTop: 30 },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: D.border,
    marginBottom: 14,
    backgroundColor: D.card,
  },
  hero: { width: '100%', height: 220, backgroundColor: '#222' },
  cardBody: { padding: 14 },
  cardTitle: { color: D.text, fontSize: 20, fontWeight: '800' },
  meta: { color: D.muted, marginTop: 6 },
  joinBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinText: { color: '#071A14', fontWeight: '800' },
});
