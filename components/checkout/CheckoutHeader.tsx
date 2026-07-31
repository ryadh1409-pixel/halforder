import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  scrollY: SharedValue<number>;
  title?: string;
  onBack: () => void;
};

/**
 * Minimal sticky header — centered title + premium circular back control.
 */
function CheckoutHeaderInner({ scrollY, title = 'Checkout', onBack }: Props) {
  const top = useSafeAreaInsets().top;

  const underline = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [8, 48], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        scaleX: interpolate(scrollY.value, [8, 48], [0.96, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const titleScale = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 40], [0.98, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(scrollY.value, [0, 60], [2, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <View style={[styles.bar, { paddingTop: Math.max(top, 12) }]}>
      <Animated.View pointerEvents="none" style={[styles.hairWrap, underline]}>
        <View style={styles.hair} />
      </Animated.View>
      <View style={styles.row}>
        <Pressable
          {...checkoutPressableProps}
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          style={styles.backSlot}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={36} tint="dark" style={styles.glassCircle}>
              <Ionicons name="chevron-back" size={22} color={CK.text} />
            </BlurView>
          ) : (
            <View style={styles.androidCircle}>
              <Ionicons name="chevron-back" size={22} color={CK.text} />
            </View>
          )}
        </Pressable>
        <Animated.Text style={[styles.title, titleScale]} accessibilityRole="header">
          {title}
        </Animated.Text>
        <View style={styles.backSlot} />
      </View>
    </View>
  );
}

export const CheckoutHeader = React.memo(CheckoutHeaderInner);

const styles = StyleSheet.create({
  bar: {
    backgroundColor: CK.bg,
    paddingBottom: 12,
    zIndex: 20,
  },
  hairWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'stretch',
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    minHeight: 48,
  },
  backSlot: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: CK.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  glassCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(28,24,38,0.72)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  androidCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(28,24,38,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
