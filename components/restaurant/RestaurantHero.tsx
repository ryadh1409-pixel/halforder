import { RP } from '@/constants/restaurantPremiumTheme';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

const HERO_H = 280;

type Props = {
  scrollY: SharedValue<number>;
  coverUri: string | null;
  topInset?: number;
  onBack: () => void;
  onSearch: () => void;
  onFavorite: () => void;
  onShare: () => void;
};

export function RestaurantHero({
  scrollY,
  coverUri,
  topInset = 0,
  onBack,
  onSearch,
  onFavorite,
  onShare,
}: Props) {
  const parallax = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, HERO_H],
          [0, -HERO_H * 0.35],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(scrollY.value, [0, HERO_H], [1, 1.08], Extrapolation.CLAMP),
      },
    ],
  }));

  const fadeButtons = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 120], [1, 0.35], Extrapolation.CLAMP),
  }));

  const tap = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.coverClip, parallax]}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.coverImg} resizeMode="cover" />
        ) : (
          <LinearGradient colors={['#1a1a2e', '#2d2d44', '#1f2937']} style={styles.coverImg} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0)']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.topRow, fadeButtons]}>
        <Pressable
          onPress={() => {
            tap();
            onBack();
          }}
          style={styles.iconBtn}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={28} tint="dark" style={styles.blurCircle}>
              <Text style={styles.iconGlyph}>‹</Text>
            </BlurView>
          ) : (
            <View style={styles.androidCircle}>
              <Text style={styles.iconGlyph}>‹</Text>
            </View>
          )}
        </Pressable>
        <View style={styles.topRight}>
          <Pressable onPress={() => { tap(); onSearch(); }} style={styles.iconBtn}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={28} tint="dark" style={styles.blurCircle}>
                <Text style={styles.iconGlyphSm}>⌕</Text>
              </BlurView>
            ) : (
              <View style={styles.androidCircle}>
                <Text style={styles.iconGlyphSm}>⌕</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => { tap(); onFavorite(); }} style={styles.iconBtn}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={28} tint="dark" style={styles.blurCircle}>
                <Text style={styles.iconGlyphSm}>♡</Text>
              </BlurView>
            ) : (
              <View style={styles.androidCircle}>
                <Text style={styles.iconGlyphSm}>♡</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => { tap(); onShare(); }} style={styles.iconBtn}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={28} tint="dark" style={styles.blurCircle}>
                <Text style={styles.iconGlyphSm}>↗</Text>
              </BlurView>
            ) : (
              <View style={styles.androidCircle}>
                <Text style={styles.iconGlyphSm}>↗</Text>
              </View>
            )}
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

export const RESTAURANT_HERO_HEIGHT = HERO_H;

const styles = StyleSheet.create({
  wrap: { height: HERO_H, overflow: 'hidden', backgroundColor: '#111' },
  coverClip: { ...StyleSheet.absoluteFillObject },
  coverImg: { width: '100%', height: HERO_H + 40 },
  topRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topRight: { flexDirection: 'row', gap: 8 },
  iconBtn: {},
  blurCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  androidCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  iconGlyphSm: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
