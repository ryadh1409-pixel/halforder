import { EMO_AI_PURPLE_SOFT } from '@/types/emoAi';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  onPress: () => void;
};

/**
 * Compact in-chat entry for the I Want wizard — sits above the composer.
 */
function IWantComposerCtaInner({ onPress }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="I Want Something"
      >
        <Text style={styles.label}>✨ I Want Something</Text>
      </Pressable>
    </View>
  );
}

export const IWantComposerCta = memo(IWantComposerCtaInner);

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: EMO_AI_PURPLE_SOFT,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  pressed: {
    opacity: 0.9,
    backgroundColor: 'rgba(168, 85, 247, 0.26)',
  },
  label: {
    color: '#E9D5FF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});
