import React, { memo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import type { EmoOrderRestaurantOption } from '@/types/emoOrder';

type Props = {
  restaurants: EmoOrderRestaurantOption[];
  onSelect: (restaurant: EmoOrderRestaurantOption) => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function ratingStars(rating: number): string {
  const full = Math.round(Math.max(0, Math.min(5, rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function priceLevelLabel(level: number | null): string {
  if (!level) return '';
  return '$'.repeat(Math.min(4, Math.max(1, level)));
}

function formatReviewCount(count: number | null): string {
  if (!count) return '';
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k reviews`;
  return `${count} reviews`;
}

function deliveryTimeLabel(min: number | null, max: number | null): string {
  if (!min && !max) return '';
  if (!max) return `${min} min`;
  return `${min}-${max} min`;
}

// ── Single card ────────────────────────────────────────────────────────────

function RestaurantCard({
  restaurant,
  onSelect,
}: {
  restaurant: EmoOrderRestaurantOption;
  onSelect: (r: EmoOrderRestaurantOption) => void;
}) {
  const isOpen = restaurant.isOpen;
  const hasPhoto = Boolean(restaurant.photoUrl);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onSelect(restaurant)}
      accessibilityRole="button"
      accessibilityLabel={`Select ${restaurant.name}`}
    >
      {/* Hero image */}
      <View style={styles.heroWrap}>
        {hasPhoto ? (
          <Image
            source={{ uri: restaurant.photoUrl! }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Text style={styles.heroEmoji}>{'🍽'}</Text>
          </View>
        )}

        {/* Open / Closed badge */}
        {isOpen !== null ? (
          <View style={[styles.openBadge, !isOpen && styles.closedBadge]}>
            <View style={[styles.openDot, !isOpen && styles.closedDot]} />
            <Text style={[styles.openBadgeText, !isOpen && styles.closedBadgeText]}>
              {isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
        ) : null}

        {/* Price level */}
        {restaurant.priceLevel ? (
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>
              {priceLevelLabel(restaurant.priceLevel)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Info section */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {restaurant.name}
        </Text>

        {/* Cuisine + address */}
        <View style={styles.metaRow}>
          {restaurant.cuisineType ? (
            <Text style={styles.cuisine}>{restaurant.cuisineType}</Text>
          ) : null}
          {restaurant.cuisineType && restaurant.address ? (
            <Text style={styles.midDot}>{'·'}</Text>
          ) : null}
          {restaurant.address ? (
            <Text style={styles.address} numberOfLines={1}>
              {restaurant.address.split(',').slice(0, 2).join(',').trim()}
            </Text>
          ) : null}
        </View>

        {/* Rating */}
        <View style={styles.ratingRow}>
          {restaurant.rating != null && restaurant.rating > 0 ? (
            <>
              <Text style={styles.stars}>{ratingStars(restaurant.rating)}</Text>
              <Text style={styles.ratingNum}>{restaurant.rating.toFixed(1)}</Text>
              {restaurant.reviewCount ? (
                <Text style={styles.reviewCount}>
                  {'('}
                  {formatReviewCount(restaurant.reviewCount)}
                  {')'}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        {/* Distance + delivery time chips */}
        <View style={styles.deliveryRow}>
          {restaurant.distanceLabel ? (
            <View style={styles.deliveryChip}>
              <Text style={styles.deliveryChipText}>{'📍 '}{restaurant.distanceLabel}</Text>
            </View>
          ) : null}
          {restaurant.deliveryTimeMin ? (
            <View style={styles.deliveryChip}>
              <Text style={styles.deliveryChipText}>
                {'🕐 '}{deliveryTimeLabel(restaurant.deliveryTimeMin, restaurant.deliveryTimeMax)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ── List ───────────────────────────────────────────────────────────────────

function EmoOrderRestaurantCardsInner({ restaurants, onSelect }: Props) {
  return (
    <View style={styles.list}>
      {restaurants.map((r) => (
        <RestaurantCard key={r.id} restaurant={r} onSelect={onSelect} />
      ))}
    </View>
  );
}

export const EmoOrderRestaurantCards = memo(EmoOrderRestaurantCardsInner);

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  list: { marginTop: 8, gap: 12 },

  card: {
    borderRadius: 20,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.2)',
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.88 },

  heroWrap: { position: 'relative', width: '100%', height: 140 },
  heroImage: { width: '100%', height: 140 },
  heroPlaceholder: {
    backgroundColor: 'rgba(168,85,247,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 44 },

  openBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.5)',
  },
  closedBadge: { borderColor: 'rgba(239,68,68,0.5)' },
  openDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22C55E' },
  closedDot: { backgroundColor: '#EF4444' },
  openBadgeText: { fontSize: 12, fontWeight: '800', color: '#22C55E' },
  closedBadgeText: { color: '#EF4444' },

  priceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  priceBadgeText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },

  info: { padding: 12, gap: 5 },

  name: { fontSize: 17, fontWeight: '900', color: '#FFFFFF' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  cuisine: { fontSize: 12, fontWeight: '700', color: EMO_AI_PURPLE },
  midDot: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
  address: { fontSize: 12, color: 'rgba(255,255,255,0.45)', flex: 1 },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stars: { fontSize: 13, color: '#FBBF24', letterSpacing: -0.5 },
  ratingNum: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  reviewCount: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

  deliveryRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  deliveryChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  deliveryChipText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
});
