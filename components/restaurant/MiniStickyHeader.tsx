import { RP } from '@/constants/restaurantPremiumTheme';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

type Props = {
  scrollY: SharedValue<number>;
  title: string;
  topInset: number;
  onBack: () => void;
};

export function MiniStickyHeader({ scrollY, title, topInset, onBack }: Props) {
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [140, 220], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(scrollY.value, [140, 220], [-8, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [200, 260], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingTop: topInset }, barStyle]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.96)' }]} />
      )}
      <Animated.View style={[styles.borderHair, borderStyle]} />
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          style={styles.back}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.spacer} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
  },
  borderHair: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: RP.border,
  },
  row: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontSize: 28, fontWeight: '300', color: RP.text, marginTop: -2 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    color: RP.text,
  },
  spacer: { width: 40 },
});
