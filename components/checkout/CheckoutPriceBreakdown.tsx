import type { CheckoutPriceLine } from '@/types/checkoutFlow';
import { CK } from '@/constants/checkoutUi';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  lines: CheckoutPriceLine[];
};

function CheckoutPriceBreakdownInner({ lines }: Props) {
  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>Receipt</Text>
      {lines.map((row) => {
        const isTotal = row.key === 'total';
        return (
          <View key={row.key} style={[styles.row, isTotal && styles.totalGap]}>
            <View style={styles.labelWrap}>
              {row.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{row.badge}</Text>
                </View>
              ) : null}
              <Text style={[styles.label, row.strikethrough && styles.strike]}>{row.label}</Text>
            </View>
            <Text
              style={[
                styles.val,
                row.strikethrough && styles.strike,
                row.emphasizeDiscount && styles.red,
                row.emphasizeSave && styles.green,
                isTotal && styles.totalTxt,
              ]}
              numberOfLines={1}
            >
              {row.value}
            </Text>
          </View>
        );
      })}
      <Text style={styles.vatDisclaimer}>Estimated taxes • final charge at authorization</Text>
    </View>
  );
}

export const CheckoutPriceBreakdown = memo(CheckoutPriceBreakdownInner);

const styles = StyleSheet.create({
  sheet: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: CK.mapRadius,
    borderWidth: 1,
    borderColor: CK.border,
    padding: 17,
    backgroundColor: CK.surface,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: CK.textMuted,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  totalGap: {
    paddingTop: 14,
    borderBottomWidth: 0,
  },
  labelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: CK.textSecondary,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(229,57,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.22)',
  },
  badgeTxt: { fontSize: 10.5, fontWeight: '900', color: CK.offer },
  val: {
    fontSize: 15,
    fontWeight: '800',
    color: CK.text,
  },
  strike: {
    textDecorationLine: 'line-through',
    color: CK.textMuted,
    fontWeight: '600',
  },
  green: { color: CK.accent },
  red: { color: CK.offer },
  totalTxt: { fontSize: 19, fontWeight: '900', letterSpacing: -0.35 },
  vatDisclaimer: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '600',
    color: CK.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
