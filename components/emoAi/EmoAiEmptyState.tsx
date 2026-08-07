import { IWantEntryCard } from '@/components/iWant/IWantEntryCard';
import { EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const MASCOT = require('../../assets/emo-ai/tab-avatar.png');

type Props = {
  onStart: () => void;
  /** Admin-only. Omit (or pass undefined) to hide "I Want Something" entirely. */
  onIWant?: () => void;
};

export function EmoAiEmptyState({ onStart, onIWant }: Props) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.wrap}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Image source={MASCOT} style={styles.mascot} contentFit="cover" />
      <Text style={styles.title}>No meals together yet.</Text>
      <Text style={styles.sub}>Let's change that 🍕</Text>
      <TouchableOpacity style={styles.btn} onPress={onStart} activeOpacity={0.9}>
        <Text style={styles.btnText}>Start Chatting</Text>
      </TouchableOpacity>
      {onIWant ? <IWantEntryCard onOrder={onIWant} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  wrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
    paddingTop: 12,
  },
  mascot: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 20,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  sub: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#B7BDC9',
    textAlign: 'center',
    marginBottom: 24,
  },
  btn: {
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: EMO_AI_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
