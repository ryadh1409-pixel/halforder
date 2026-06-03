import { RP } from '@/constants/restaurantPremiumTheme';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  visible: boolean;
  itemCount: number;
  savings?: number;
  total: number;
  onCheckout: () => void;
  disabled?: boolean;
  label?: string;
};

export function FloatingCartBar({
  visible,
  itemCount,
  total,
  onCheckout,
}: Props) {
  const insets = useSafeAreaInsets();
  const open = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    open.value = withSpring(visible ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [visible, open]);

  const barAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - open.value) * 100 }],
    opacity: open.value,
  }));

  const pressAnim = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.wrap,
        { bottom: Math.max(insets.bottom, 14) + 72 },
        barAnim,
      ]}
    >
      <AnimatedPressable
        style={[styles.card, pressAnim, disabled && styles.cardDisabled]}
        disabled={disabled}
        onPressIn={() => {
          if (!disabled) press.value = withSpring(0.98, { damping: 16, stiffness: 400 });
        }}
        onPressOut={() => {
          press.value = withSpring(1, { damping: 12, stiffness: 280 });
        }}
        onPress={() => {
          if (disabled) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onCheckout();
        }}
      >
        <Text style={styles.ctaTxt}>
          {label ??
            `View cart · ${itemCount} ${itemCount === 1 ? 'item' : 'items'} · $${total.toFixed(2)}`}
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 30,
  },
  cardDisabled: { opacity: 0.45 },
  card: {
    backgroundColor: RP.blackBtn,
    borderRadius: 999,
    paddingVertical: 17,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.25,
    textAlign: 'center',
  },
});
