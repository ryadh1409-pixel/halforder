import {
  EMO_AI_PURPLE,
  EMO_AI_PURPLE_SOFT,
  EMO_AI_SURFACE,
} from '@/types/emoAi';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  onOrder: () => void;
};

function IWantEntryCardInner({ onOrder }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>✨</Text>
      </View>
      <Text style={styles.title}>I Want Something</Text>
      <Text style={styles.subtitle}>
        Tell Emo what you&apos;d like from any restaurant and we&apos;ll take care of
        the rest.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={onOrder}
        accessibilityRole="button"
        accessibilityLabel="Order with Emo"
      >
        <Ionicons name="sparkles" size={18} color="#FFFFFF" />
        <Text style={styles.btnText}>Order with Emo</Text>
      </Pressable>
    </View>
  );
}

export const IWantEntryCard = memo(IWantEntryCardInner);

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: 20,
    padding: 18,
    borderRadius: 20,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMO_AI_PURPLE_SOFT,
    marginBottom: 12,
  },
  icon: {
    fontSize: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
    lineHeight: 20,
  },
  btn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: EMO_AI_PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnPressed: {
    opacity: 0.92,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
