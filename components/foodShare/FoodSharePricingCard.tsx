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
};

const SUCCESS = '#22C55E';

function FeeBlock({
  title,
  original,
  share,
  free,
  freeLabel,
  variant,
  dark,
}: {
  title: string;
  original: number;
  share: number;
  free: boolean;
  freeLabel: string;
  variant: Variant;
  dark: boolean;
}) {
  if (free) {
    return (
      <View style={styles.feeBlock}>
        <Text style={[styles.feeTitle, dark && styles.textLight]}>{title}</Text>
        <Text style={styles.freeBadge}>{freeLabel}</Text>
      </View>
    );
  }
  return (
    <View style={styles.feeBlock}>
      <View style={styles.feeHeader}>
        <Text style={[styles.feeTitle, dark && styles.textLight]}>{title}</Text>
        <Text style={[styles.feeOriginal, dark && styles.textMuted]}>
          {formatShareCurrency(original)}
        </Text>
      </View>
      <Text style={[styles.yourShareLabel, dark && styles.textMuted]}>
        Your Share
      </Text>
      <Text
        style={[
          styles.yourShareValue,
          variant === 'card' && styles.yourShareValueCard,
          dark && styles.textLight,
        ]}
      >
        {formatShareCurrency(share)}
      </Text>
    </View>
  );
}

function FoodSharePricingCardInner({
  pricing,
  variant = 'checkout',
  style,
  showTax = true,
  showSavings = false,
}: Props) {
  const dark = variant === 'card' || variant === 'payment';
  const totalLabel =
    variant === 'payment' || variant === 'receipt'
      ? variant === 'payment'
        ? 'Final Amount'
        : 'Paid Amount'
      : variant === 'checkout'
        ? 'Grand Total'
        : 'Total';

  return (
    <View
      style={[
        styles.card,
        dark ? styles.cardDark : styles.cardLight,
        style,
      ]}
    >
      {variant !== 'compact' ? (
        <View style={styles.titleRow}>
          <Ionicons
            name="receipt-outline"
            size={16}
            color={dark ? '#C084FC' : '#7C3AED'}
          />
          <Text style={[styles.sectionTitle, dark && styles.textLight]}>
            {variant === 'card' ? 'Your pricing' : 'Order summary'}
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={[styles.rowLabel, dark && styles.textMuted]}>Food</Text>
        <Text style={[styles.rowValue, dark && styles.textLight]}>
          {formatShareCurrency(pricing.sharedFoodPrice)}
        </Text>
      </View>

      <FeeBlock
        title="Delivery"
        original={pricing.originalDeliveryFee}
        share={pricing.sharedDeliveryFee}
        free={pricing.freeDelivery}
        freeLabel="FREE DELIVERY"
        variant={variant}
        dark={dark}
      />

      <FeeBlock
        title="Service Fee"
        original={pricing.originalServiceFee}
        share={pricing.sharedServiceFee}
        free={pricing.freeServiceFee}
        freeLabel="FREE SERVICE FEE"
        variant={variant}
        dark={dark}
      />

      {pricing.promoDiscount > 0 ? (
        <View style={styles.row}>
          <Text style={[styles.rowLabel, dark && styles.textMuted]}>
            Promotion
          </Text>
          <Text style={styles.promoValue}>
            -{formatShareCurrency(pricing.promoDiscount)}
          </Text>
        </View>
      ) : null}

      {showTax ? (
        <View style={styles.row}>
          <Text style={[styles.rowLabel, dark && styles.textMuted]}>
            {variant === 'payment' ? 'Tax' : 'Taxes'}
          </Text>
          <Text style={[styles.rowValue, dark && styles.textLight]}>
            {formatShareCurrency(pricing.tax)}
          </Text>
        </View>
      ) : null}

      <View style={[styles.divider, dark && styles.dividerDark]} />

      <View style={styles.row}>
        <Text style={[styles.totalLabel, dark && styles.textLight]}>
          {totalLabel}
        </Text>
        <Text style={[styles.totalValue, dark && styles.totalValueDark]}>
          {formatShareCurrency(
            showTax ? pricing.grandTotal : pricing.displaySubtotal,
          )}
        </Text>
      </View>

      {showSavings && pricing.totalSaving > 0 ? (
        <View style={styles.savingsRow}>
          <Text style={styles.savingsLabel}>Savings</Text>
          <Text style={styles.savingsValue}>
            {formatShareCurrency(pricing.totalSaving)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export const FoodSharePricingCard = memo(FoodSharePricingCardInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  cardDark: {
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  feeBlock: {
    paddingVertical: 8,
    gap: 2,
  },
  feeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  feeOriginal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748b',
  },
  yourShareLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 2,
  },
  yourShareValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  yourShareValueCard: {
    color: '#7DFFB8',
    fontSize: 15,
  },
  freeBadge: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '900',
    color: SUCCESS,
    letterSpacing: 0.4,
  },
  promoValue: {
    fontSize: 15,
    fontWeight: '800',
    color: SUCCESS,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
    marginVertical: 10,
  },
  dividerDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#7C3AED',
  },
  totalValueDark: {
    color: '#C084FC',
  },
  savingsRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(34, 197, 94, 0.25)',
  },
  savingsLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: SUCCESS,
  },
  savingsValue: {
    fontSize: 16,
    fontWeight: '900',
    color: SUCCESS,
  },
  textLight: { color: '#FFFFFF' },
  textMuted: { color: '#B7BDC9' },
});
