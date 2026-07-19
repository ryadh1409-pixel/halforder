import {
  EMO_AI_QUICK_REPLIES,
} from '@/types/emoAi';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  onSelect: (text: string) => void;
  disabled?: boolean;
};

export function EmoAiQuickReplies({ onSelect, disabled }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {EMO_AI_QUICK_REPLIES.map((label) => (
        <TouchableOpacity
          key={label}
          style={[styles.chip, disabled && styles.chipDisabled]}
          onPress={() => onSelect(label)}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Text style={styles.chipText}>{label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  chipDisabled: { opacity: 0.5 },
  chipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
