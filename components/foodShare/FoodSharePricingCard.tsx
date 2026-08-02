import { formatShareCurrency } from '@/lib/foodSharePricing';
import type { FoodShareUserPricing } from '@/lib/foodShareUserPricing';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

type Variant = 'card' | 'checkout' | 'payment' | 'receipt' | 'compact';

type Props = {
  pricing: FoodShareUserPricing;
  variant?: Variant;
  style?: ViewStyle;
  showTax?: boolean;
  showSavings?: boolean;
  fulfillmentMode?: 'delivery' | 'pickup';
};

const PURPLE      = '#7C3AED';
const PURPLE_DARK = '#C084FC';
const PURPLE_SOFT = '#F5F3FF';
const GREEN       = '#16A34A';
const GREEN_BG    = 'rgba(22,163,74,0.08)';
const GREEN_BORDER= 'rgba(22,163,74,0.2)';
const RED         = '#DC2626';
const RED_BG      = 'rgba(220,38,38,0.06)';
const GOLD        = '#D97706';
const GOLD_BG     = 'rgba(217,119,6,0.08)';

// ── Shared fee block (Delivery / Service Fee) ─────────────────────────────────

function FeeBlock({
  icon,
  title,
  original,
  share,
  free,
  freeLabel,
  dark,
}: {
  icon: string;
  title: string;
  original: number;
  share: number;
  free: boolean;
  freeLabel: string;
  dark: boolean;
}) {
  if (free) {
    return (
      <View style={[styles.feeCard, dark ? styles.feeCardDark : styles.feeCardFree]}>
        <View style={styles.feeCardLeft}>
          <Text style={styles.feeCardIcon}>{icon}</Text>
          <Text style={[styles.feeCardTitle, dark && styles.textLight]}>{title}</Text>
        </View>
        <View style={styles.freePill}>
          <Text style={styles.freePillText}>{freeLabel}</Text>
        </View>
      </View>
    );
  }

  const saved = original - share;

  return (
    <View style={[styles.feeCard, dark ? styles.feeCardDark : styles.feeCardLight]}>
      {/* Title row */}
      <View style={styles.feeCardTitleRow}>
        <Text style={styles.feeCardIcon}>{icon}</Text>
        <Text style={[styles.feeCardTitle, dark && styles.textLight]}>{title}</Text>
      </View>

      {/* Price breakdown */}
      <View style={styles.feePriceBlock}>
        {/* Original price */}
        <View style={styles.feeRow}>
          <Text style={[styles.feeRowLabel, dark && styles.textMuted]}>Full price</Text>
          <Text style={[styles.feeOriginalPrice, dark && styles.textMutedStrike]}>
            {formatShareCurrency(original)}
          </Text>
        </View>

        {/* Discount */}
        {saved > 0 ? (
          <View style={[styles.feeRow, styles.discountRow]}>
            <View style={styles.discountPill}>
              <Text style={styles.discountPillText}>½ HalfOrder discount</Text>
            </View>
            <Text style={styles.discountAmount}>−{formatShareCurrency(saved)}</Text>
          </View>
        ) : null}

        {/* Divider */}
        <View style={[styles.feeDivider, dark && styles.feeDividerDark]} />

        {/* You pay */}
        <View style={styles.feeRow}>
          <Text style={[styles.youPayLabel, dark ? styles.textMuted : null]}>
            You pay
          </Text>
          <Text style={[styles.youPayAmount, dark && styles.youPayAmountDark]}>
            {formatShareCurrency(share)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

function FoodSharePricingCardInner({
  pricing,
  variant = 'checkout',
  style,
  showTax = true,
  showSavings = false,
  fulfillmentMode = 'delivery',
}: Props) {
  const dark = variant === 'card' || variant === 'payment';
  const isPickup = fulfillmentMode === 'pickup';
  const totalLabel =
    variant === 'payment'
      ? 'Final Amount'
      : variant === 'receipt'
        ? 'Paid Amount'
        : variant === 'checkout'
          ? 'Grand Total'
          : 'Total';

  return (
    <View style={[styles.card, dark ? styles.cardDark : styles.cardLight, style]}>

      {/* ── Header ── */}
      {variant !== 'compact' ? (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons
              name="receipt-outline"
              size={15}
              color={dark ? PURPLE_DARK : PURPLE}
            />
            <Text style={[styles.headerTitle, dark && { color: PURPLE_DARK }]}>
              {variant === 'card' ? 'Your pricing' : 'Order Summary'}
            </Text>
          </View>
          <View style={[styles.halfOrderBadge, dark && styles.halfOrderBadgeDark]}>
            <Text style={[styles.halfOrderBadgeText, dark && { color: PURPLE_DARK }]}>
              HalfOrder
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── Food ── */}
      <View style={[styles.simpleRow, dark && styles.simpleRowDark]}>
        <View style={styles.simpleRowLeft}>
          <Text style={styles.simpleRowIcon}>🍽️</Text>
          <Text style={[styles.simpleRowLabel, dark && styles.textLight]}>Food</Text>
        </View>
        <Text style={[styles.simpleRowValue, dark && styles.textLight]}>
          {formatShareCurrency(pricing.sharedFoodPrice)}
        </Text>
      </View>

      {/* ── Delivery ── */}
      {isPickup ? (
        <View style={[styles.simpleRow, dark && styles.simpleRowDark]}>
          <View style={styles.simpleRowLeft}>
            <Text style={styles.simpleRowIcon}>🏪</Text>
            <Text style={[styles.simpleRowLabel, dark && styles.textLight]}>Pickup</Text>
          </View>
          <View style={styles.freePill}>
            <Text style={styles.freePillText}>FREE</Text>
          </View>
        </View>
      ) : (
        <FeeBlock
          icon="🚚"
          title="Delivery Fee"
          original={pricing.originalDeliveryFee}
          share={pricing.sharedDeliveryFee}
          free={pricing.freeDelivery}
          freeLabel="FREE"
          dark={dark}
        />
      )}

      {/* ── Service Fee ── */}
      <FeeBlock
        icon="⚡"
        title="Service Fee"
        original={pricing.originalServiceFee}
        share={pricing.sharedServiceFee}
        free={pricing.freeServiceFee}
        freeLabel="FREE"
        dark={dark}
      />

      {/* ── Promo ── */}
      {pricing.promoDiscount > 0 ? (
        <View style={[styles.simpleRow, dark && styles.simpleRowDark]}>
          <View style={styles.simpleRowLeft}>
            <Text style={styles.simpleRowIcon}>🎟️</Text>
            <Text style={[styles.simpleRowLabel, dark && styles.textLight]}>Promo Code</Text>
          </View>
          <Text style={styles.promoAmount}>−{formatShareCurrency(pricing.promoDiscount)}</Text>
        </View>
      ) : null}

      {/* ── Tax ── */}
      {showTax ? (
        <View style={[styles.simpleRow, dark && styles.simpleRowDark]}>
          <View style={styles.simpleRowLeft}>
            <Text style={styles.simpleRowIcon}>🏛️</Text>
            <Text style={[styles.simpleRowLabel, dark && styles.textMuted]}>
              {variant === 'payment' ? 'Tax' : 'Taxes (HST)'}
            </Text>
          </View>
          <Text style={[styles.simpleRowValue, dark && styles.textMuted]}>
            {formatShareCurrency(pricing.tax)}
          </Text>
        </View>
      ) : null}

      {/* ── Total ── */}
      <View style={[styles.totalRow, dark && styles.totalRowDark]}>
        <Text style={[styles.totalLabel, dark && styles.textLight]}>{totalLabel}</Text>
        <Text style={[styles.totalAmount, dark && styles.totalAmountDark]}>
          {formatShareCurrency(showTax ? pricing.grandTotal : pricing.displaySubtotal)}
        </Text>
      </View>

      {/* ── Savings ── */}
      {showSavings && pricing.totalSaving > 0 ? (
        <View style={styles.savingsBanner}>
          <View style={styles.savingsBannerLeft}>
            <Text style={styles.savingsEmoji}>🎉</Text>
            <View>
              <Text style={styles.savingsTitle}>You saved today!</Text>
              <Text style={styles.savingsSubtitle}>Compared to ordering alone</Text>
            </View>
          </View>
          <View style={styles.savingsAmountBlock}>
            <Text style={styles.savingsAmount}>
              −{formatShareCurrency(pricing.totalSaving)}
            </Text>
            <Text style={styles.savingsCurrency}>CAD</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export const FoodSharePricingCard = memo(FoodSharePricingCardInner);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card shell
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15,23,42,0.08)',
  },
  cardDark: {
    backgroundColor: 'rgba(18,20,30,0.95)',
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: PURPLE,
  },
  halfOrderBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: PURPLE_SOFT,
  },
  halfOrderBadgeDark: {
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  halfOrderBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: PURPLE,
    letterSpacing: 0.3,
  },

  // Simple rows (food, tax, promo)
  simpleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.05)',
  },
  simpleRowDark: {
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  simpleRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  simpleRowIcon: {
    fontSize: 15,
  },
  simpleRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  simpleRowValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },

  // Fee cards (delivery, service)
  feeCard: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  feeCardLight: {
    backgroundColor: '#FAFAFA',
    borderColor: 'rgba(15,23,42,0.07)',
  },
  feeCardDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  feeCardFree: {
    backgroundColor: GOLD_BG,
    borderColor: 'rgba(217,119,6,0.15)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feeCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feeCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  feeCardIcon: {
    fontSize: 15,
  },
  feeCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },

  // Price breakdown inside fee card
  feePriceBlock: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 4,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeRowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94a3b8',
  },
  feeOriginalPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  textMutedStrike: {
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  discountRow: {
    marginTop: 1,
  },
  discountPill: {
    backgroundColor: RED_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  discountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: RED,
    letterSpacing: 0.1,
  },
  discountAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: RED,
  },
  feeDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15,23,42,0.08)',
    marginVertical: 6,
  },
  feeDividerDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  youPayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  youPayAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: PURPLE,
  },
  youPayAmountDark: {
    color: PURPLE_DARK,
  },

  // Free badge
  freePill: {
    backgroundColor: GOLD_BG,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.2)',
  },
  freePillText: {
    fontSize: 11,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 0.5,
  },

  // Promo
  promoAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: GOLD,
  },

  // Total row
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(15,23,42,0.08)',
    marginTop: 4,
  },
  totalRowDark: {
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: PURPLE,
  },
  totalAmountDark: {
    color: PURPLE_DARK,
  },

  // Savings banner
  savingsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: GREEN_BG,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
  },
  savingsBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  savingsEmoji: {
    fontSize: 24,
  },
  savingsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: GREEN,
  },
  savingsSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: GREEN,
    opacity: 0.75,
    marginTop: 2,
  },
  savingsAmountBlock: {
    alignItems: 'flex-end',
  },
  savingsAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: GREEN,
  },
  savingsCurrency: {
    fontSize: 10,
    fontWeight: '700',
    color: GREEN,
    opacity: 0.7,
    marginTop: 1,
    textAlign: 'right',
  },

  // Shared text overrides
  textLight: { color: '#FFFFFF' },
  textMuted: { color: '#94a3b8' },
});
