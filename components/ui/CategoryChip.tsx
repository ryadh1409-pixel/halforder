import { UE } from '@/constants/uberEatsTheme';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';

type Props = {
  label: string;
  active?: boolean;
  onPress: () => void;
};

function CategoryChipInner({ label, active, onPress }: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={anim}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={active ? { selected: true } : {}}
        onPressIn={() => {
          scale.value = withSpring(0.94, { damping: 16, stiffness: 400 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 260 });
        }}
        onPress={onPress}
        style={[styles.chip, active && styles.chipActive]}
      >
        <Text style={[styles.label, active && styles.labelActive]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export const CategoryChip = memo(CategoryChipInner);

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: UE.radiusPill,
    backgroundColor: UE.chipInactiveBg,
    marginRight: 8,
    borderWidth: 1,
    borderColor: UE.borderLight,
  },
  chipActive: {
    backgroundColor: UE.chipActive,
    borderColor: UE.chipActive,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: UE.text,
  },
  labelActive: {
    color: '#FFFFFF',
  },
});
