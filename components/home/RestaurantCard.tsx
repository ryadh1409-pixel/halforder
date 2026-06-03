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
  const hasRating =
    restaurant.reviewCount > 0 &&
    restaurant.rating != null &&
    restaurant.rating > 0;
  const distanceLabel = restaurant.distanceKmLabel;
  const deliveryUnavailable =
    restaurant.isOpen && restaurant.deliverable === false;

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
      style={[styles.card, { width }, deliveryUnavailable && styles.cardDim, anim]}
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
            <Text style={styles.pillTxt}>{restaurant.etaLabel}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillTxt} numberOfLines={1}>
              {restaurant.deliveryFeeLabel}
            </Text>
          </View>
        </View>
        {!restaurant.isOpen ? (
          <View style={styles.closed}>
            <Text style={styles.closedTxt}>Closed</Text>
          </View>
        ) : deliveryUnavailable ? (
          <View style={styles.closed}>
            <Text style={styles.closedTxt}>
              {restaurant.deliveryStatusLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <View style={styles.ratingRow}>
          {hasRating ? (
            <Text style={styles.ratingCompact}>
              {restaurant.rating!.toFixed(1)} ★ (
              {restaurant.reviewCount.toLocaleString('en-CA')})
            </Text>
          ) : (
            <Text style={styles.newLabel}>New</Text>
          )}
          {distanceLabel ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.distance}>{distanceLabel}</Text>
            </>
          ) : null}
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
  cardDim: { opacity: 0.72 },
  imageWrap: {
    borderRadius: UE.radiusCard,
    overflow: 'hidden',
    backgroundColor: UE.surface,
    aspectRatio: 1.35,
  },
  image: { width: '100%', height: '100%' },
  imageGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  ph: { alignItems: 'center', justifyContent: 'center' },
  phTxt: { fontSize: 40, fontWeight: '900', color: UE.textMuted },
  promoBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: UE.promo,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  promoTxt: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: '48%',
  },
  pillTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  closed: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  body: { paddingTop: 10, paddingHorizontal: 2 },
  name: {
    fontSize: 16,
    fontWeight: '900',
    color: UE.text,
    letterSpacing: -0.3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
    flexWrap: 'wrap',
  },
  ratingCompact: { fontSize: 13, fontWeight: '800', color: UE.text },
  newLabel: { fontSize: 13, fontWeight: '800', color: UE.textMuted },
  dot: { color: UE.textMuted, fontWeight: '700' },
  distance: { fontSize: 13, fontWeight: '600', color: UE.textMuted },
});
