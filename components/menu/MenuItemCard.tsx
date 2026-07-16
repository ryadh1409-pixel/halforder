import { PromotionBadge } from '@/components/PromotionBadge';
import { RP } from '@/constants/restaurantPremiumTheme';
import type { DisplayMenuItem } from '@/utils/menuDisplayEnrich';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type Props = {
  item: DisplayMenuItem;
  qty: number;
  onPress: () => void;
  onAdd: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Full-width grid dish card (category browser). Uses lazy image decoding via expo-image. */
export function MenuItemCard({ item, qty, onPress, onAdd }: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const hasAdminBadge =
    item.promotionBadge != null && item.promotionBadge !== 'none';

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.98, { damping: 16, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 260 });
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
            transition={320}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.name}`}
          style={styles.plusBtn}
          hitSlop={12}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAdd();
          }}
        >
          <Text style={styles.plusTxt}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.price}>${item.price.toFixed(2)}</Text>
      <Text style={styles.ing} numberOfLines={2}>
        {item.shortIngredients}
      </Text>
      {qty > 0 ? (
        <View style={styles.qtyPill}>
          <Text style={styles.qtyPillTxt}>{qty} in cart</Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    width: '100%',
    marginBottom: 0,
    backgroundColor: RP.bg,
    borderRadius: RP.radiusL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RP.border,
    padding: 10,
    shadowColor: RP.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  imageWrap: { position: 'relative', borderRadius: 18, overflow: 'hidden' },
  image: { width: '100%', height: 130, borderRadius: 18, backgroundColor: RP.surface },
  imagePh: { alignItems: 'center', justifyContent: 'center' },
  imagePhTxt: { fontSize: 36 },
  offerBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: RP.offer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  offerBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
  promoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
  },
  plusBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RP.text,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  plusTxt: { color: '#fff', fontSize: 26, fontWeight: '400', marginTop: -2 },
  title: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '900',
    color: RP.text,
    minHeight: 40,
    letterSpacing: -0.25,
  },
  price: { marginTop: 4, fontSize: 15, fontWeight: '800', color: RP.text },
  ing: { marginTop: 4, fontSize: 12, fontWeight: '600', color: RP.textSecondary, lineHeight: 16 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  like: { fontSize: 11, fontWeight: '700', color: RP.textMuted },
  pill: {
    fontSize: 10,
    fontWeight: '900',
    color: RP.accent,
    backgroundColor: 'rgba(0,200,83,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pill2: {
    fontSize: 10,
    fontWeight: '900',
    color: RP.textSecondary,
    backgroundColor: RP.surface,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qtyPill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: RP.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  qtyPillTxt: { fontSize: 11, fontWeight: '900', color: RP.text },
});
