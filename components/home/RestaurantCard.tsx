import { UE } from '@/constants/uberEatsTheme';
import type { HomeRestaurant } from '@/types/homeRestaurant';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { platformElevation } from '@/utils/platformElevation';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  restaurant: HomeRestaurant;
  width: number;
  onPress: () => void;
};

function RestaurantCardInner({ restaurant, width, onPress }: Props) {
  const [fav, setFav] = useState(false);
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const img = restaurant.coverImage ?? restaurant.image;
  const feeLabel =
    restaurant.deliveryFee <= 0
      ? '$0 delivery'
      : `$${restaurant.deliveryFee.toFixed(2)}`;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => {
        scale.value = withSpring(0.985, { damping: 20, stiffness: 380 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      }}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.card, { width }, anim]}
    >
      <View style={styles.imageWrap}>
        {img ? (
          <Image
            source={{ uri: img }}
            style={styles.image}
            contentFit="cover"
            transition={320}
          />
        ) : (
          <View style={[styles.image, styles.ph]}>
            <Text style={styles.phTxt}>{restaurant.name.slice(0, 1)}</Text>
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={styles.imageGradient}
        />
        {restaurant.promoLabel ? (
          <View style={styles.promoBadge}>
            <Text style={styles.promoTxt}>{restaurant.promoLabel}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fav ? 'Remove favorite' : 'Add favorite'}
          hitSlop={12}
          style={styles.heartBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            void Haptics.selectionAsync();
            setFav((v) => !v);
          }}
        >
          <Ionicons
            name={fav ? 'heart' : 'heart-outline'}
            size={20}
            color={fav ? UE.promo : '#FFFFFF'}
          />
        </Pressable>
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Ionicons name="time-outline" size={12} color="#FFF" />
            <Text style={styles.pillTxt}>
              {restaurant.etaMin}–{restaurant.etaMax} min
            </Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillTxt}>{feeLabel}</Text>
          </View>
        </View>
        {!restaurant.isOpen ? (
          <View style={styles.closed}>
            <Text style={styles.closedTxt}>Closed</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <View style={styles.ratingRow}>
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={12} color={UE.text} />
            <Text style={styles.ratingVal}>{restaurant.rating.toFixed(1)}</Text>
          </View>
          <Text style={styles.reviews}>
            ({restaurant.reviewCount.toLocaleString()}+)
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.distance}>
            {restaurant.distanceMi.toFixed(1)} mi
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

export const RestaurantCard = memo(RestaurantCardInner);

const styles = StyleSheet.create({
  card: {
    marginRight: UE.spaceCard,
    ...platformElevation({
      web: '0px 4px 20px rgba(0, 0, 0, 0.08)',
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  imageWrap: {
    borderRadius: UE.radiusXL + 2,
    overflow: 'hidden',
    aspectRatio: UE.cardImageRatio,
    backgroundColor: UE.surface,
    marginBottom: UE.spaceInline,
  },
  image: { width: '100%', height: '100%' },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  ph: { alignItems: 'center', justifyContent: 'center' },
  phTxt: { fontSize: 40, fontWeight: '900', color: UE.textMuted },
  promoBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    backgroundColor: UE.promo,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  promoTxt: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.2,
  },
  heartBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pillRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: UE.radiusPill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillTxt: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  closed: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedTxt: { color: '#FFF', fontWeight: '900', fontSize: 17 },
  body: { paddingHorizontal: 2, paddingBottom: 4 },
  name: {
    fontSize: 18,
    fontWeight: '900',
    color: UE.text,
    letterSpacing: -0.35,
    lineHeight: 24,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 4,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: UE.surface,
  },
  ratingVal: { fontSize: 13, fontWeight: '900', color: UE.text },
  reviews: { fontSize: 13, fontWeight: '600', color: UE.textSecondary },
  dot: { fontSize: 13, color: UE.textMuted, marginHorizontal: 2 },
  distance: { fontSize: 13, fontWeight: '600', color: UE.textMuted },
});
