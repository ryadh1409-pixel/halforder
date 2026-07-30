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
            ? `Only ${card.spotsLeft} spots left`
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
      <View style={styles.imageArea}>
        <Image
          source={{ uri: card.heroImageUri }}
          style={styles.hero}
          contentFit="cover"
          transition={280}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={styles.scrimBottom}
          pointerEvents="none"
        />

        <View style={styles.topRow} pointerEvents="none">
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
                <Text
                  style={styles.overflowChipTxt}
                >{`+${hiddenChipCount}`}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.availChip}>
            {Platform.OS === 'ios' ? (
              <BlurView
                intensity={18}
                tint="dark"
                style={styles.glassFill}
                pointerEvents="none"
              />
            ) : null}
            {liveNow ? (
              <View style={styles.liveDot} />
            ) : (
              <Ionicons
                name={closingSoon ? 'hourglass-outline' : 'time-outline'}
                size={11}
                color={closingSoon ? '#FFC49B' : 'rgba(255,255,255,0.8)'}
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

        <View style={styles.titleBlock} pointerEvents="none">
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
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
            <Text style={styles.priceLabel}>You pay</Text>
            <Text style={styles.priceValue} numberOfLines={1}>
              {youPay}
            </Text>
          </View>
          <Pressable
            onPress={openPricing}
            accessibilityRole="button"
            accessibilityLabel="View pricing details"
            hitSlop={10}
            style={({ pressed }) => [
              styles.detailsBtn,
              pressed && styles.detailsBtnPressed,
            ]}
          >
            <Text style={styles.detailsTxt}>View pricing details</Text>
            <Ionicons
              name="chevron-forward"
              size={13}
              color="rgba(255,255,255,0.5)"
            />
          </Pressable>
        </View>

        <View style={styles.pillRow}>
          {saving > 0 ? (
            <View style={styles.savePill}>
              <Text style={styles.pillTxt} numberOfLines={1}>
                {`✓ Save ${formatShareCurrency(saving)} vs full order`}
              </Text>
            </View>
          ) : null}
          {joinLocked ? (
            <View
              style={[
                styles.statusBadge,
                status === 'ready'
                  ? styles.statusBadgeReady
                  : styles.statusBadgeMatched,
              ]}
            >
              <Text style={styles.pillTxt} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
          ) : (
            <View style={[styles.spotsPill, urgent && styles.spotsPillHot]}>
              <Text style={styles.pillTxt} numberOfLines={1}>
                {`${waiting ? '✓' : urgent ? '🔥' : '👥'} ${spotsLabel}`}
              </Text>
            </View>
          )}
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
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#141820',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  imageArea: { flex: 1, overflow: 'hidden' },
  hero: { ...StyleSheet.absoluteFillObject },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  topRow: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  chipRow: {
    flexShrink: 1,
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
  availChip: {
    flexShrink: 0,
    maxWidth: '62%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  glassFill: { ...StyleSheet.absoluteFillObject },
  availTxt: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.1,
  },
  availTxtSoon: { color: '#FFC49B', fontWeight: '600' },
  titleBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 32,
  },
  restaurant: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  description: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 18,
  },
  panel: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    backgroundColor: '#141820',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  priceBlock: { flexShrink: 1 },
  priceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  priceValue: {
    marginTop: 2,
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingBottom: 6,
  },
  detailsBtnPressed: { opacity: 0.6 },
  detailsTxt: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  pillTxt: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  savePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#15803D',
  },
  spotsPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  spotsPillHot: { backgroundColor: '#92400E' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeMatched: { backgroundColor: 'rgba(168, 85, 247, 0.92)' },
  statusBadgeReady: { backgroundColor: 'rgba(34, 197, 94, 0.92)' },
});
