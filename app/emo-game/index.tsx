import {
  EMO_AI_BG,
  EMO_AI_PURPLE,
  EMO_AI_SURFACE,
} from '@/types/emoAi';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Placeholder hub for Emo games — gameplay not implemented yet.
 */
export default function EmoGameScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Emo Game</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Emo Game</Text>
        <Text style={styles.subtitle}>Choose a game with Emo</Text>

        <Pressable style={styles.card} disabled>
          <Text style={styles.cardEmoji}>🃏</Text>
          <Text style={styles.cardTitle}>UNO</Text>
          <Text style={styles.cardHint}>Coming soon</Text>
        </Pressable>

        <Pressable style={styles.card} disabled>
          <Text style={styles.cardEmoji}>🎲</Text>
          <Text style={styles.cardTitle}>Flip Challenge</Text>
          <Text style={styles.cardHint}>Coming soon</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: EMO_AI_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#B7BDC9',
    marginBottom: 8,
  },
  card: {
    minHeight: 120,
    borderRadius: 18,
    padding: 20,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    justifyContent: 'center',
    gap: 4,
  },
  cardEmoji: { fontSize: 32, marginBottom: 4 },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cardHint: {
    fontSize: 13,
    fontWeight: '700',
    color: EMO_AI_PURPLE,
  },
});
