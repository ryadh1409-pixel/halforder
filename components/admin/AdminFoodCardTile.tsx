import { adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import {
  availabilityStatusLabel,
  type AdminFoodShareAvailabilityStatus,
} from '@/lib/adminFoodShareAvailability';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type AdminFoodCardTileProps = {
  cardId: string;
  title: string;
  restaurantName?: string;
  imageUri: string;
  priceLabel: string;
  sharingPriceLabel?: string;
  availabilityStatus: AdminFoodShareAvailabilityStatus;
  configured: boolean;
  onPress: () => void;
  busy?: boolean;
  waitingUserName?: string | null;
  /** Waiting alone longer than 30 minutes. */
  staleWaiting?: boolean;
  /** Human-readable wait duration, e.g. "32 min". */
  waitingElapsedLabel?: string | null;
};

export function AdminFoodCardTile({
  cardId,
  title,
  restaurantName,
  imageUri,
  priceLabel,
  sharingPriceLabel,
  availabilityStatus,
  configured,
  onPress,
  busy,
  waitingUserName,
  staleWaiting,
  waitingElapsedLabel,
}: AdminFoodCardTileProps) {
  const displayTitle = title.trim() || `Slot ${cardId}`;
  const hasImage = imageUri.trim().length > 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.tile,
        pressed && styles.tilePressed,
        busy && styles.tileBusy,
        staleWaiting && styles.tileStale,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Food card ${displayTitle}, slot ${cardId}`}
    >
      <View style={styles.imageWrap}>
        {hasImage ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="fast-food-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.placeholderText}>
              {configured ? 'No image' : 'Empty slot'}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.badge,
            availabilityStatus === 'live'
              ? styles.badgeActive
              : availabilityStatus === 'scheduled'
                ? styles.badgeScheduled
                : availabilityStatus === 'expired'
                  ? styles.badgeExpired
                  : styles.badgeInactive,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              availabilityStatus === 'live'
                ? styles.badgeTextActive
                : styles.badgeTextInactive,
            ]}
          >
            {availabilityStatusLabel(availabilityStatus)}
          </Text>
        </View>
        {busy ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color="#fff" size="small" />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.slotId}>#{cardId}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {displayTitle}
        </Text>
        {restaurantName ? (
          <Text style={styles.restaurant} numberOfLines={1}>
            {restaurantName}
          </Text>
        ) : null}
        <Text style={styles.price}>{priceLabel}</Text>
        {sharingPriceLabel ? (
          <Text style={styles.sharePrice}>{sharingPriceLabel}</Text>
        ) : null}
        {staleWaiting ? (
          <View style={styles.staleBadge}>
            <Ionicons name="warning-outline" size={12} color="#B45309" />
            <Text style={styles.staleBadgeText} numberOfLines={2}>
              Needs Attention
              {waitingElapsedLabel ? ` · ${waitingElapsedLabel}` : ''}
            </Text>
          </View>
        ) : waitingUserName ? (
          <View style={styles.waitingBadge}>
            <Ionicons name="time-outline" size={12} color="#B45309" />
            <Text style={styles.waitingBadgeText} numberOfLines={1}>
              Waiting: {waitingUserName}
            </Text>
          </View>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.cta}>View details</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tileStale: {
    borderColor: 'rgba(245, 158, 11, 0.55)',
  },
  tilePressed: { opacity: 0.88 },
  tileBusy: { opacity: 0.7 },
  imageWrap: {
    height: 108,
    backgroundColor: '#B7BDC9',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeActive: { backgroundColor: COLORS.successBg },
  badgeScheduled: { backgroundColor: 'rgba(99,102,241,0.16)' },
  badgeExpired: { backgroundColor: 'rgba(220,38,38,0.12)' },
  badgeInactive: { backgroundColor: 'rgba(15, 23, 42, 0.08)' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  badgeTextActive: { color: COLORS.successText },
  badgeTextInactive: { color: COLORS.textMuted },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 10, gap: 2 },
  slotId: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 18,
  },
  restaurant: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  price: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  sharePrice: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  waitingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.14)',
    alignSelf: 'flex-start',
  },
  waitingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
    maxWidth: 140,
  },
  staleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.22)',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  staleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 6,
  },
  cta: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
