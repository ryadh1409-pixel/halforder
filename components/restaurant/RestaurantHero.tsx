import { RP } from '@/constants/restaurantPremiumTheme';
import { RestaurantHeroShell } from '@/constants/restaurantLayout';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

const HERO_H = RestaurantHeroShell.height;

export const RESTAURANT_HERO_HEIGHT = HERO_H;

type Props = {
  scrollY: SharedValue<number>;
  coverUri: string | null;
  topInset?: number;
  onBack: () => void;
  onSearch: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onMore: () => void;
};

export function RestaurantHero({
  scrollY,
  coverUri,
  topInset = 0,
  onBack,
  onSearch,
  onFavorite,
  onShare,
  onMore,
}: Props) {
  const parallax = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, HERO_H],
          [0, -HERO_H * 0.38],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(scrollY.value, [0, HERO_H], [1, 1.1], Extrapolation.CLAMP),
      },
    ],
  }));

  const fadeButtons = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [40, 140], [1, 0.4], Extrapolation.CLAMP),
  }));

  const tapLight = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  const topPad = topInset + 6;

  return (
    <View style={[styles.wrap, { height: HERO_H }]}>
      <Animated.View style={[styles.coverClip, parallax]}>
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={styles.coverImg}
            contentFit="cover"
            transition={420}
            recyclingKey={coverUri}
          />
        ) : (
          <LinearGradient colors={['#1a1a2e', '#2d3748', '#0f172a']} style={styles.coverImg} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.08)', 'rgba(255,255,255,0)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.topRow, fadeButtons, { paddingTop: topPad }]}>
        <GlassIconButton
          onPress={() => {
            tapLight();
            onBack();
          }}
          label="Go back"
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </GlassIconButton>

        <View style={styles.topRight}>
          <GlassIconButton onPress={() => { tapLight(); onSearch(); }} label="Search menu">
            <Ionicons name="search" size={19} color="#fff" />
          </GlassIconButton>
          <GlassIconButton onPress={() => { tapLight(); onFavorite(); }} label="Favorite">
            <Ionicons name="heart-outline" size={21} color="#fff" />
          </GlassIconButton>
          <GlassIconButton onPress={() => { tapLight(); onMore(); }} label="More">
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
          </GlassIconButton>
          <GlassIconButton onPress={() => { tapLight(); onShare(); }} label="Share">
            <Ionicons name="share-outline" size={20} color="#fff" />
          </GlassIconButton>
        </View>
      </Animated.View>
    </View>
  );
}

function GlassIconButton({
  children,
  onPress,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.iconBtn}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={34} tint="dark" style={styles.blurCircle}>
          {children}
        </BlurView>
      ) : (
        <View style={styles.androidCircle}>{children}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: RP.text },
  coverClip: { ...StyleSheet.absoluteFillObject },
  coverImg: { width: '100%', height: HERO_H + 48 },
  topRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 2,
  },
  topRight: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 230,
  },
  iconBtn: {},
  blurCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  androidCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
