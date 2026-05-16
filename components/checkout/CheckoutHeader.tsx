import { CK } from '@/constants/checkoutUi';
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
 * Minimal sticky header — centered title + back glass pill; separates with hairline while scrolling.
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
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          style={styles.backSlot}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={28} tint="light" style={styles.glassCircle}>
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
    backgroundColor: CK.headerHairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minHeight: 44,
  },
  backSlot: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: CK.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  glassCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(12,12,14,0.08)',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  androidCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: CK.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CK.border,
  },
});
