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
  const waitingCopy =
    status === 'waiting_for_member' ? '✔ 1 of 2 members joined' : null;
  const urgent = !joinLocked && card.spotsLeft > 0 && card.spotsLeft <= 3;
  const spotsLabel = joinLocked
    ? status === 'ready'
      ? 'Both members joined successfully'
      : 'Both members matched'
    : status === 'waiting_for_member'
      ? 'Waiting for 1 more member'
      : card.spotsLeft <= 0
        ? 'Full'
        : urgent
          ? `Only ${card.spotsLeft} spot${card.spotsLeft === 1 ? '' : 's'} remaining`
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

  return (
    <View style={styles.face}>
      <Image
        source={{ uri: card.heroImageUri }}
        style={styles.hero}
        contentFit="cover"
        transition={280}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.38)', 'transparent']}
        style={styles.scrimTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[
          'transparent',
          'rgba(0,0,0,0.3)',
          'rgba(0,0,0,0.78)',
          'rgba(0,0,0,0.95)',
        ]}
        locations={[0, 0.4, 0.76, 1]}
        style={styles.scrimBottom}
        pointerEvents="none"
      />

      <View style={styles.chipRow} pointerEvents="none">
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

        {availability ? (
          <View style={styles.availability}>
            <Ionicons name="time-outline" size={13} color="#C9CFDB" />
            <Text style={styles.availabilityTxt} numberOfLines={1}>
              {availability.detail
                ? `${availability.title} • ${availability.detail}`
                : availability.title}
            </Text>
          </View>
        ) : null}

        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
            <Text style={styles.priceLabel}>You Pay</Text>
            <Text style={styles.priceValue} numberOfLines={1}>
              {youPay}
            </Text>
          </View>
          {saving > 0 ? (
            <View style={styles.savePill}>
              <Ionicons name="checkmark" size={12} color="#7DFFB8" />
              <Text style={styles.savePillTxt} numberOfLines={1}>
                {`Save ${formatShareCurrency(saving)}`}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={openPricing}
          accessibilityRole="button"
          accessibilityLabel="View pricing details"
          hitSlop={6}
          style={({ pressed }) => [
            styles.glassBtn,
            pressed && styles.glassBtnPressed,
          ]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={28}
              tint="dark"
              style={styles.glassFill}
              pointerEvents="none"
            />
          ) : null}
          <Text style={styles.glassBtnTxt}>View pricing details</Text>
          <Ionicons name="chevron-forward" size={13} color="#F2F3F6" />
        </Pressable>

        <View style={styles.statusRow}>
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
          ) : waitingCopy ? (
            <Text style={styles.waitingAccent} numberOfLines={1}>
              {waitingCopy}
            </Text>
          ) : urgent ? (
            <Ionicons name="flame" size={14} color="#FF8A5C" />
          ) : (
            <Ionicons name="people-outline" size={14} color="#C9CFDB" />
          )}
          <Text
            style={[styles.spots, urgent && styles.spotsUrgent]}
            numberOfLines={1}
          >
            {spotsLabel}
          </Text>
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
    height: '18%',
  },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '56%',
  },
  chipRow: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.24,
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
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
  },
  ghostChipTxt: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  overflowChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  overflowChipTxt: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  body: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: 26,
    paddingTop: 44,
  },
  restaurant: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B7BDC9',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.7,
    lineHeight: 36,
  },
  description: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
    color: '#9AA1AF',
    lineHeight: 19,
  },
  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  availabilityTxt: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#C9CFDB',
    letterSpacing: 0.1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 22,
  },
  priceBlock: { flexShrink: 1 },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9AA1AF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  priceValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(125,255,184,0.35)',
  },
  savePillTxt: { fontSize: 12, fontWeight: '800', color: '#7DFFB8' },
  glassBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  glassBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    transform: [{ scale: 0.97 }],
  },
  glassFill: { ...StyleSheet.absoluteFillObject },
  glassBtnTxt: { fontSize: 13, fontWeight: '700', color: '#F2F3F6' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  spots: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#C9CFDB',
  },
  spotsUrgent: { color: '#FFFFFF', fontWeight: '700' },
  waitingAccent: { fontSize: 13, fontWeight: '700', color: '#4ADE80' },
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
