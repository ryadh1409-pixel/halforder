import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import type { EmoReviewsRichData } from '@/types/emoOrder';

type Props = EmoReviewsRichData;

function StarRow({ rating }: { rating: number }) {
  const full = Math.round(Math.max(0, Math.min(5, rating)));
  return (
    <Text style={styles.stars}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)}
    </Text>
  );
}

function formatReviewCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function EmoOrderReviewsCardInner({
  restaurantName,
  rating,
  reviewCount,
  reviews,
  keywordThemes,
}: Props) {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.restaurantName} numberOfLines={1}>
            {restaurantName}
          </Text>
          <Text style={styles.sectionLabel}>Google Reviews</Text>
        </View>
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingNum}>{rating.toFixed(1)}</Text>
          <StarRow rating={rating} />
          <Text style={styles.reviewCountText}>
            {formatReviewCount(reviewCount)} reviews
          </Text>
        </View>
      </View>

      {/* Keyword themes */}
      {keywordThemes.length > 0 ? (
        <View style={styles.themesSection}>
          <Text style={styles.themesLabel}>Customers frequently mention</Text>
          <View style={styles.themesList}>
            {keywordThemes.map((theme) => (
              <View key={theme} style={styles.themeChip}>
                <Text style={styles.themeChipText}>{'✓ '}{theme}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Review snippets */}
      {reviews.length > 0 ? (
        <View style={styles.reviewsSection}>
          {reviews.slice(0, 2).map((rv, idx) => (
            <View key={idx} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewAuthor}>{rv.author}</Text>
                <StarRow rating={rv.rating} />
                {rv.timeAgo ? (
                  <Text style={styles.reviewTime}>{rv.timeAgo}</Text>
                ) : null}
              </View>
              <Text style={styles.reviewText} numberOfLines={3}>
                {rv.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const EmoOrderReviewsCard = memo(EmoOrderReviewsCardInner);

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 14,
    borderRadius: 20,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.2)',
    gap: 12,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  restaurantName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    flex: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ratingBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
    minWidth: 80,
  },
  ratingNum: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  stars: {
    fontSize: 11,
    color: '#FBBF24',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  reviewCountText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
    marginTop: 3,
  },

  themesSection: { gap: 8 },
  themesLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  themesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  themeChip: {
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
  },
  themeChipText: { fontSize: 12, color: EMO_AI_PURPLE, fontWeight: '700' },

  reviewsSection: { gap: 10 },
  reviewItem: {
    gap: 5,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  reviewAuthor: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
  reviewTime: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },
  reviewText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
