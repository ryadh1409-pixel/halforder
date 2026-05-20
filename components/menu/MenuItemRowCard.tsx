import { UE } from '@/constants/uberEatsTheme';
import type { DisplayMenuItem } from '@/utils/menuDisplayEnrich';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const IMG = 132;

type Props = {
  item: DisplayMenuItem;
  qty: number;
  onPress: () => void;
  onAdd: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Uber Eats menu row — copy left, large image + floating + on the right. */
function MenuItemRowCardInner({ item, qty, onPress, onAdd }: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => {
        scale.value = withSpring(0.99, { damping: 18, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 280 });
      }}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.row, anim]}
    >
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.desc} numberOfLines={3}>
          {item.shortIngredients}
        </Text>
        {item.offerLabel ? (
          <View style={styles.tagRow}>
            <View style={[styles.tag, styles.tagPromo]}>
              <Text style={[styles.tagTxt, styles.tagPromoTxt]}>
                {item.offerLabel}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>${item.price.toFixed(2)}</Text>
        </View>
        {qty > 0 ? <Text style={styles.inCart}>{qty} in cart</Text> : null}
      </View>

      <View style={styles.media}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.image}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[styles.image, styles.imagePh]}>
            <Text style={styles.imagePhTxt}>🍽</Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.name}`}
          style={styles.plusBtn}
          hitSlop={12}
          onPress={(e) => {
            e.stopPropagation();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAdd();
          }}
        >
          <Text style={styles.plusTxt}>+</Text>
        </Pressable>
      </View>
    </AnimatedPressable>
  );
}

export const MenuItemRowCard = memo(MenuItemRowCardInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UE.borderLight,
    backgroundColor: UE.bg,
    gap: 14,
    minHeight: IMG + 36,
  },
  copy: { flex: 1, minWidth: 0, paddingRight: 4 },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: UE.text,
    letterSpacing: -0.25,
    lineHeight: 22,
  },
  desc: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    color: UE.textSecondary,
    lineHeight: 19,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: UE.surface,
  },
  tagPromo: { backgroundColor: UE.promoSoft },
  tagTxt: { fontSize: 11, fontWeight: '800', color: UE.textSecondary },
  tagPromoTxt: { color: UE.promo },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  price: { fontSize: 16, fontWeight: '900', color: UE.text },
  liked: { fontSize: 13, fontWeight: '600', color: UE.textMuted },
  inCart: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: UE.accentDark,
  },
  media: {
    width: IMG,
    height: IMG,
    borderRadius: UE.radiusL,
    overflow: 'hidden',
    backgroundColor: UE.surface,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  imagePh: { alignItems: 'center', justifyContent: 'center' },
  imagePhTxt: { fontSize: 40 },
  plusBtn: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: UE.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: UE.bg,
  },
  plusTxt: { color: '#FFF', fontSize: 22, fontWeight: '500', marginTop: -2 },
});
