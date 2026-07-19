import { EMO_AI_QUICK_REPLIES } from '@/types/emoAi';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  onSelect: (text: string) => void;
  disabled?: boolean;
};

/** Compact single-row iMessage-style suggestion chips. */
export function EmoAiQuickReplies({ onSelect, disabled }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
      >
        {EMO_AI_QUICK_REPLIES.map((label) => (
          <TouchableOpacity
            key={label}
            style={[styles.chip, disabled && styles.chipDisabled]}
            onPress={() => onSelect(label)}
            disabled={disabled}
            activeOpacity={0.85}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 40,
    marginBottom: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  row: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168, 85, 247, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDisabled: { opacity: 0.45 },
  chipText: {
    color: '#E8EAF0',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
