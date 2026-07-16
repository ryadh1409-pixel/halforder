import { PromotionBadge } from '@/components/PromotionBadge';
import {
  formatShareCurrency,
} from '@/lib/foodSharePricing';
import type { SwipeFoodCard as SwipeFoodCardType } from '@/types/swipe';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  card: SwipeFoodCardType;
};

function SwipeFoodCardInner({ card }: Props) {
  const spotsLabel =
    card.spotsLeft <= 0
      ? 'Full'
      : `${card.spotsLeft} spot${card.spotsLeft === 1 ? '' : 's'} left`;
  const hasPromo =
    card.promotionBadge != null && card.promotionBadge !== 'none';

  return (
    <View style={styles.face}>
      <Image
        source={{ uri: card.heroImageUri }}
        style={styles.hero}
        contentFit="cover"
        transition={280}
      />
      <LinearGradient
        colors={[
          'transparent',
          'rgba(0,0,0,0.2)',
          'rgba(0,0,0,0.75)',
          'rgba(0,0,0,0.95)',
        ]}
        locations={[0, 0.35, 0.72, 1]}
        style={styles.gradient}
      />

      {hasPromo ? (
        <PromotionBadge value={card.promotionBadge} style={styles.promoBadge} />
      ) : (
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>Admin meal share</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.restaurant} numberOfLines={1}>
          {card.restaurantName}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>
        {card.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {card.description}
          </Text>
        ) : null}
        <Text style={styles.original}>
          Full meal {formatShareCurrency(card.originalPrice)}
        </Text>
        <Text style={styles.split}>
          You pay {formatShareCurrency(card.sharedPrice)} food +{' '}
          {formatShareCurrency(card.deliveryShare)} delivery
        </Text>
        <Text style={styles.total}>
          {formatShareCurrency(card.totalPerUser)} total
        </Text>

        <View style={styles.social}>
          <View style={styles.socialCopy}>
            <Text style={styles.activity}>Swipe right to join this share</Text>
            <Text style={styles.spots}>{spotsLabel}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const SwipeFoodCard = memo(SwipeFoodCardInner);

const styles = StyleSheet.create({
  face: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#141820',
  },
  hero: { ...StyleSheet.absoluteFillObject },
  gradient: { ...StyleSheet.absoluteFillObject },
  promoBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 2,
  },
  livePill: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  liveTxt: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  body: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 22,
    paddingTop: 48,
  },
  restaurant: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B7BDC9',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  description: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
    lineHeight: 18,
  },
  original: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  split: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: '#7DFFB8',
  },
  total: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  socialCopy: { flex: 1, minWidth: 0 },
  activity: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  spots: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#B7BDC9',
  },
});
