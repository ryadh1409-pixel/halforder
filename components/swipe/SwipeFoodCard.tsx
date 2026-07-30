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
      <View style={styles.imageArea}>
        <Image
          source={{ uri: card.heroImageUri }}
          style={styles.hero}
          contentFit="cover"
          transition={280}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.34)', 'rgba(0,0,0,0.78)']}
          locations={[0, 0.5, 1]}
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
              ellipsizeMode="clip"
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
            {Platform.OS === 'ios' ? (
              <BlurView
                intensity={14}
                tint="light"
                style={styles.glassFill}
                pointerEvents="none"
              />
            ) : null}
            <Text style={styles.detailsTxt}>View pricing details</Text>
            <Ionicons
              name="chevron-forward"
              size={12}
              color="rgba(255,255,255,0.9)"
            />
          </Pressable>
        </View>

        <View style={styles.pillRow}>
          {saving > 0 ? (
            <View style={styles.savePill}>
              <Text style={styles.pillTxt} numberOfLines={1}>
                {`✓ Save ${formatShareCurrency(saving)}`}
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
              {urgent ? (
                <LinearGradient
                  colors={['rgba(251,146,60,0.34)', 'rgba(234,88,12,0.18)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.glassFill}
                  pointerEvents="none"
                />
              ) : null}
              <Text
                style={[styles.pillTxt, urgent && styles.pillTxtHot]}
                numberOfLines={1}
              >
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
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  imageArea: { flex: 1, overflow: 'hidden' },
  /** Scaled a touch so the crop fills the hero area; `cover` keeps the ratio. */
  hero: { ...StyleSheet.absoluteFillObject, transform: [{ scale: 1.03 }] },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  topStack: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
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
  /** Badge metrics are shared so every chip keeps the same height. */
  chip: {
    flexShrink: 1,
    justifyContent: 'center',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  chipTxt: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  ghostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168, 85, 247, 0.32)',
  },
  ghostChipTxt: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  overflowChip: {
    justifyContent: 'center',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  overflowChipTxt: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  availChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  glassFill: { ...StyleSheet.absoluteFillObject },
  availTxt: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.1,
  },
  availTxtSoon: { color: '#FFC49B', fontWeight: '600' },
  titleBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 28,
  },
  restaurant: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 30,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  description: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  panel: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#141820',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.9,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingLeft: 16,
    paddingRight: 13,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  detailsBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    transform: [{ scale: 0.97 }],
  },
  detailsTxt: {
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  /** Pills size to their content so they never stretch across the card. */
  pillTxt: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pillTxtHot: { color: '#FFE1CE' },
  savePill: {
    justifyContent: 'center',
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: '#15803D',
  },
  spotsPill: {
    justifyContent: 'center',
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  spotsPillHot: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,146,60,0.45)',
  },
  statusBadge: {
    justifyContent: 'center',
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
  },
  statusBadgeMatched: { backgroundColor: 'rgba(168, 85, 247, 0.92)' },
  statusBadgeReady: { backgroundColor: 'rgba(34, 197, 94, 0.92)' },
});
