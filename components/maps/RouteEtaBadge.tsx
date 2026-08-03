/**
 * Floating ETA badge over the live route — presentation only.
 */
import { UE } from '@/constants/uberEatsTheme';
import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  label: string | null;
  visible: boolean;
};

export function RouteEtaBadge({ label, visible }: Props) {
  const insets = useSafeAreaInsets();
  const open = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    open.value = withSpring(visible && label ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [visible, label, open]);

  useEffect(() => {
    if (!visible || !label) return;
    pulse.value = 0.96;
    pulse.value = withTiming(1, { duration: 280 });
  }, [label, visible, pulse]);

  const anim = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [
      { scale: 0.92 + open.value * 0.08 * pulse.value },
      { translateY: (1 - open.value) * 10 },
    ],
  }));

  if (!label) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { top: Math.max(insets.top, 12) + 56 }, anim]}
    >
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: UE.radiusPill,
    backgroundColor: 'rgba(11, 8, 22, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: UE.shadow,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: -0.2,
  },
});
