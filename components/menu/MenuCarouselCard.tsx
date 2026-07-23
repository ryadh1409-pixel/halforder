import { PromotionBadge } from '@/components/PromotionBadge';
import { RP } from '@/constants/restaurantPremiumTheme';
import type { DisplayMenuItem } from '@/utils/menuDisplayEnrich';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export const MENU_CARD_WIDTH = 180;

type Props = {
  item: DisplayMenuItem;
  qty: number;
  onPress: () => void;
  onAdd: () => void;
  onRemove?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Compact dish tile for horizontal “Popular / Deals” carousels. */
export function MenuCarouselCard({ item, qty, onPress, onAdd, onRemove }: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const hasAdminBadge =
    item.promotionBadge != null && item.promotionBadge !== 'none';

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 18, stiffness: 420 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      }}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.card, animStyle]}
    >
      <View style={styles.imageWrap}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.image}
            contentFit="cover"
            transition={280}
          />
        ) : (
          <View style={[styles.image, styles.imagePh]}>
            <Text style={styles.imagePhTxt}>🍽</Text>
          </View>
        )}
        {hasAdminBadge ? (
          <PromotionBadge value={item.promotionBadge} style={styles.promoBadge} />
        ) : item.offerLabel ? (
          <View style={styles.offerBadge}>
            <Text style={styles.offerBadgeTxt}>{item.offerLabel}</Text>
          </View>
        ) : null}
        {qty > 0 ? (
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              hitSlop={8}
              accessibilityLabel={`Remove one ${item.name}`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRemove?.();
              }}
            >
              <Text style={styles.stepTxt}>−</Text>
            </Pressable>
            <Text style={styles.stepQty}>{qty}</Text>
            <Pressable
              style={styles.stepBtn}
              hitSlop={8}
              accessibilityLabel={`Add ${item.name}`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onAdd();
              }}
            >
              <Text style={styles.stepTxt}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.plusBtn}
            hitSlop={10}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAdd();
            }}
          >
            <Text style={styles.plusTxt}>+</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.price}>${item.price.toFixed(2)}</Text>
      <Text style={styles.desc} numberOfLines={2}>
        {item.shortIngredients}
      </Text>
      {qty > 0 ? (
        <View style={styles.inCartBadge}>
          <Text style={styles.inCartBadgeTxt}>{qty} in cart</Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: MENU_CARD_WIDTH,
    backgroundColor: RP.bg,
    borderRadius: RP.radiusM + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RP.border,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  imageWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: RP.surface,
  },
  image: { width: '100%', aspectRatio: 1.05, backgroundColor: RP.surface },
  imagePh: { alignItems: 'center', justifyContent: 'center' },
  imagePhTxt: { fontSize: 32 },
  offerBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: RP.offer,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  offerBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  promoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
  },
  plusBtn: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#171923',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  plusTxt: { color: '#fff', fontSize: 22, fontWeight: '500', marginTop: -2 },
  stepper: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 17,
    backgroundColor: '#171923',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    paddingHorizontal: 2,
  },
  stepBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTxt: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginTop: -1 },
  stepQty: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center',
  },
  title: { marginTop: 8, fontSize: 14, fontWeight: '900', color: RP.text, minHeight: 36 },
  price: { marginTop: 4, fontSize: 14, fontWeight: '800', color: RP.text },
  desc: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: RP.textSecondary,
    lineHeight: 14,
    minHeight: 28,
  },
  inCartBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: RP.surface,
  },
  inCartBadgeTxt: { fontSize: 11, fontWeight: '900', color: RP.textSecondary },
});
