import { RP } from '@/constants/restaurantPremiumTheme';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const CARDS = [
  { key: '1', title: '$0 delivery', sub: 'On $25+ orders', tone: 'green' as const },
  { key: '2', title: 'Earliest', sub: 'Arrives in 25–35 min', tone: 'neutral' as const },
  { key: '3', title: 'Promotions', sub: 'Save on bundles', tone: 'red' as const },
  { key: '4', title: 'Free item', sub: 'Spend $40+', tone: 'gold' as const },
];

export function PromoBanner() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Quick picks</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {CARDS.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => void Haptics.selectionAsync()}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardSub}>{c.sub}</Text>
            <View
              style={[
                styles.dot,
                c.tone === 'green' && styles.dotGreen,
                c.tone === 'red' && styles.dotRed,
                c.tone === 'gold' && styles.dotGold,
              ]}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  sectionTitle: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '800',
    color: RP.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  scroll: { paddingHorizontal: 16, gap: 12 },
  card: {
    width: 168,
    padding: 14,
    borderRadius: RP.radiusM,
    backgroundColor: RP.bg,
    borderWidth: 1,
    borderColor: RP.border,
    marginRight: 12,
    shadowColor: RP.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardPressed: { transform: [{ scale: 0.98 }] },
  cardTitle: { fontSize: 17, fontWeight: '900', color: RP.text },
  cardSub: { marginTop: 6, fontSize: 13, fontWeight: '600', color: RP.textSecondary },
  dot: {
    marginTop: 12,
    height: 4,
    width: 36,
    borderRadius: 2,
    backgroundColor: RP.surface2,
  },
  dotGreen: { backgroundColor: RP.accent },
  dotRed: { backgroundColor: RP.offer },
  dotGold: { backgroundColor: RP.gold },
});
