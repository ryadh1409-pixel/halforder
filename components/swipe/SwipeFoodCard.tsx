import { SwipePricingDetailsSheet } from '@/components/swipe/SwipePricingDetailsSheet';
import { isPickupFulfillment } from '@/lib/foodShareFulfillment';
import { formatShareCurrency } from '@/lib/foodSharePricing';
import {
  promotionBadgeColor,
  promotionBadgeLabel,
  type PromotionBadgeValue,
} from '@/lib/promotionBadge';
import { formatSwipeAvailabilityWindow } from '@/lib/swipeAvailabilityWindow';
import {
  isSwipeMarketplaceJoinLocked,
  SWIPE_MARKETPLACE_STATUS_LABEL,
} from '@/lib/swipeMarketplaceStatus';
import type { SwipeFoodCard as SwipeFoodCardType } from '@/types/swipe';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  card: SwipeFoodCardType;
};

/** Chips share one row, so the food stays the hero. */
const MAX_VISIBLE_CHIPS = 3;

type Chip = {
  key: string;
  label: string;
  color: string;
};

function promoChips(
  values: readonly Exclude<PromotionBadgeValue, 'none'>[],
): Chip[] {
  const chips: Chip[] = [];
  for (const value of values) {
    const label = promotionBadgeLabel(value);
    const color = promotionBadgeColor(value);
    if (!label || !color) continue;
    if (chips.some((chip) => chip.key === value)) continue;
    chips.push({ key: value, label, color });
  }
  return chips;
}

function SwipeFoodCardInner({ card }: Props) {
  const [pricingOpen, setPricingOpen] = useState(false);
  const openPricing = useCallback(() => setPricingOpen(true), []);
  const closePricing = useCallback(() => setPricingOpen(false), []);

  const isPickup = isPickupFulfillment(card.fulfillmentMode);
  const status = card.marketplaceStatus ?? 'available';
  const joinLocked = isSwipeMarketplaceJoinLocked(status);
  const statusLabel = SWIPE_MARKETPLACE_STATUS_LABEL[status];
  const waiting = !joinLocked && status === 'waiting_for_member';
  const urgent =
    !joinLocked && !waiting && card.spotsLeft > 0 && card.spotsLeft <= 3;
  const spotsLabel = joinLocked
    ? status === 'ready'
      ? 'Both members joined successfully'
      : 'Both members matched'
    : status === 'waiting_for_member'
      ? 'Waiting for 1 more member'
      : card.spotsLeft <= 0
        ? 'Full'
        : card.spotsLeft === 1
          ? 'Last spot remaining'
          : urgent
            ? `Only ${card.spotsLeft} spots remaining`
            : `${card.spotsLeft} spots available`;

  const chips = useMemo<Chip[]>(() => {
    const promoValues =
      card.promotionBadges && card.promotionBadges.length > 0
        ? card.promotionBadges
        : card.promotionBadge != null && card.promotionBadge !== 'none'
          ? [card.promotionBadge as Exclude<PromotionBadgeValue, 'none'>]
          : [];
    const list: Chip[] = [];
    if (isPickup) {
      list.push({ key: 'pickup', label: '🛍️ Free Pickup', color: '#0EA5E9' });
    } else {
      if (card.referralRewardLabel) {
        list.push({
          key: 'referral',
          label: card.referralRewardLabel,
          color: 'rgba(168, 85, 247, 0.92)',
        });
      }
      list.push(...promoChips(promoValues));
    }
    return list;
  }, [
    card.promotionBadge,
    card.promotionBadges,
    card.referralRewardLabel,
    isPickup,
  ]);

  const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenChipCount = chips.length - visibleChips.length;

  const availability = useMemo(
    () =>
      formatSwipeAvailabilityWindow({
        availableFromMs: card.availableFromMs,
        availableUntilMs: card.availableUntilMs,
      }),
    [card.availableFromMs, card.availableUntilMs],
  );

  const youPay = formatShareCurrency(card.pricing.displaySubtotal);
  const saving = card.pricing.totalSaving;

  // No window means the share is open-ended, so it is simply live right now.
  const availabilityText = availability
    ? availability.detail
      ? `${availability.title} • ${availability.detail}`
      : availability.title
    : 'Available now';
  // A green dot reads as "open right now"; anything dated gets a clock.
  const liveNow = availability == null || availability.tone === 'now';
  const closingSoon = availability?.tone === 'ending-soon';

  return (
    <View style={styles.face}>
      <Image
        source={{ uri: card.heroImageUri }}
        style={styles.hero}
        contentFit="cover"
        transition={280}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.34)', 'rgba(0,0,0,0.12)', 'transparent']}
        locations={[0, 0.62, 1]}
        style={styles.scrimTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[
          'transparent',
          'rgba(0,0,0,0.28)',
          'rgba(0,0,0,0.7)',
          'rgba(0,0,0,0.9)',
        ]}
        locations={[0, 0.3, 0.7, 1]}
        style={styles.scrimBottom}
        pointerEvents="none"
      />

      <View style={styles.topStack} pointerEvents="none">
        <View style={styles.chipRow}>
          {visibleChips.length > 0 ? (
            visibleChips.map((chip) => (
              <View
                key={chip.key}
                style={[styles.chip, { backgroundColor: chip.color }]}
              >
                <Text style={styles.chipTxt} numberOfLines={1}>
                  {chip.label}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.ghostChip}>
              <View style={styles.liveDot} />
              <Text style={styles.ghostChipTxt}>Admin meal share</Text>
            </View>
          )}
          {hiddenChipCount > 0 ? (
            <View style={styles.overflowChip}>
              <Text style={styles.overflowChipTxt}>{`+${hiddenChipCount}`}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.availChip}>
          {liveNow ? (
            <View style={styles.liveDot} />
          ) : (
            <Ionicons
              name={closingSoon ? 'hourglass-outline' : 'time-outline'}
              size={12}
              color={closingSoon ? '#FFC49B' : 'rgba(255,255,255,0.78)'}
            />
          )}
          <Text
            style={[styles.availTxt, closingSoon && styles.availTxtSoon]}
            numberOfLines={1}
          >
            {availabilityText}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.restaurant} numberOfLines={1}>
          {card.restaurantName}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>
        {card.description ? (
          <Text
            style={styles.description}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {card.description}
          </Text>
        ) : null}

        <View style={styles.priceBlock}>
          <Text style={styles.priceLabel}>You Pay</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue} numberOfLines={1}>
              {youPay}
            </Text>
            <Pressable
              onPress={openPricing}
              accessibilityRole="button"
              accessibilityLabel="View pricing details"
              hitSlop={8}
              style={({ pressed }) => [
                styles.glassBtn,
                pressed && styles.glassBtnPressed,
              ]}
            >
              {Platform.OS === 'ios' ? (
                <BlurView
                  intensity={18}
                  tint="dark"
                  style={styles.glassFill}
                  pointerEvents="none"
                />
              ) : null}
              <Text style={styles.glassBtnTxt}>View pricing details</Text>
              <Ionicons name="chevron-forward" size={12} color="#F2F3F6" />
            </Pressable>
          </View>
          {saving > 0 ? (
            <LinearGradient
              colors={['rgba(52,211,153,0.30)', 'rgba(34,197,94,0.14)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.savePill}
            >
              <Ionicons name="checkmark-circle" size={13} color="#7DFFB8" />
              <Text style={styles.savePillTxt} numberOfLines={1}>
                {`Save ${formatShareCurrency(saving)} vs Full Order`}
              </Text>
            </LinearGradient>
          ) : null}
        </View>

        <View style={styles.footerRow}>
          {joinLocked ? (
            <View
              style={[
                styles.statusBadge,
                status === 'ready'
                  ? styles.statusBadgeReady
                  : styles.statusBadgeMatched,
              ]}
            >
              <Text style={styles.statusBadgeTxt}>{statusLabel}</Text>
            </View>
          ) : null}
          <View style={[styles.urgencyChip, urgent && styles.urgencyChipHot]}>
            {waiting ? (
              <Ionicons name="checkmark-circle" size={13} color="#4ADE80" />
            ) : urgent ? (
              <Ionicons name="flame" size={13} color="#FF8A5C" />
            ) : (
              <Ionicons name="people-outline" size={13} color="#C9CFDB" />
            )}
            <Text
              style={[styles.spots, urgent && styles.spotsUrgent]}
              numberOfLines={1}
            >
              {spotsLabel}
            </Text>
          </View>
        </View>
      </View>

      {pricingOpen ? (
        <SwipePricingDetailsSheet
          visible
          onClose={closePricing}
          card={card}
        />
      ) : null}
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
  scrimTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '20%',
  },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '54%',
  },
  topStack: {
    position: 'absolute',
    top: 16,
    left: 24,
    right: 24,
    zIndex: 3,
    alignItems: 'flex-start',
    gap: 8,
  },
  chipRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 8,
  },
  chip: {
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  chipTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  ghostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168, 85, 247, 0.32)',
  },
  ghostChipTxt: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  overflowChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  overflowChipTxt: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  body: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 40,
  },
  restaurant: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.7,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.7,
    lineHeight: 36,
  },
  description: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '500',
    color: '#DDE1E8',
    opacity: 0.7,
    lineHeight: 19,
  },
  availChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(8,10,16,0.3)',
  },
  availTxt: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.82,
    letterSpacing: 0.1,
  },
  availTxtSoon: { color: '#FFC49B', opacity: 1, fontWeight: '600' },
  priceBlock: { marginTop: 24 },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9AA1AF',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
  },
  priceValue: {
    flexShrink: 1,
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  savePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 16,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125,255,184,0.3)',
  },
  savePillTxt: { fontSize: 12.5, fontWeight: '800', color: '#7DFFB8' },
  glassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  glassBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ scale: 0.97 }],
  },
  glassFill: { ...StyleSheet.absoluteFillObject },
  glassBtnTxt: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.92,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  urgencyChip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(12,14,20,0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  urgencyChipHot: {
    backgroundColor: 'rgba(255,138,92,0.15)',
    borderColor: 'rgba(255,138,92,0.36)',
  },
  spots: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#C9CFDB',
  },
  spotsUrgent: { color: '#FFD9C4', fontWeight: '800' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusBadgeMatched: { backgroundColor: 'rgba(168, 85, 247, 0.92)' },
  statusBadgeReady: { backgroundColor: 'rgba(34, 197, 94, 0.92)' },
  statusBadgeTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
