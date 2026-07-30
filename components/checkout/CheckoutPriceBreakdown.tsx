import type { CheckoutPriceLine } from '@/types/checkoutFlow';
import { CK } from '@/constants/checkoutUi';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

type Props = {
  lines: CheckoutPriceLine[];
};

/** Rows that only appear after a user action — they fade in instead of popping. */
const ANIMATED_KEYS = new Set(['promo', 'beforeSave']);

type RowProps = {
  row: CheckoutPriceLine;
  animate: boolean;
};

const PriceRow = memo(function PriceRow({ row, animate }: RowProps) {
  const appear = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(appear, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animate, appear]);

  const isTotal = row.key === 'total';
  const isStrike = Boolean(row.strikethrough);

  return (
    <Animated.View
      style={[
        styles.row,
        isTotal && styles.totalRow,
        isStrike && styles.strikeRow,
        animate && {
          opacity: appear,
          transform: [
            {
              translateY: appear.interpolate({
                inputRange: [0, 1],
                outputRange: [-4, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.labelWrap}>
        {row.badge ? (
          <View
            style={[
              styles.badge,
              row.badge === 'Hi emooo' && styles.badgeHiEmooo,
            ]}
          >
            <Text
              style={[
                styles.badgeTxt,
                row.badge === 'Hi emooo' && styles.badgeHiEmoooTxt,
              ]}
            >
              {row.badge}
            </Text>
          </View>
        ) : null}
        <Text
          style={[
            styles.label,
            isTotal && styles.totalLabel,
            isStrike && styles.strikeLabel,
          ]}
        >
          {row.label}
        </Text>
      </View>
      <Text
        style={[
          styles.val,
          row.emphasizeDiscount && styles.red,
          row.emphasizeSave && styles.green,
          isStrike && styles.strike,
          isTotal && styles.totalTxt,
        ]}
        numberOfLines={1}
      >
        {row.value}
      </Text>
    </Animated.View>
  );
});

function CheckoutPriceBreakdownInner({ lines }: Props) {
  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>Receipt</Text>
      {lines.map((row) => {
        const isTotal = row.key === 'total';
        return (
          <React.Fragment key={row.key}>
            {isTotal ? <View style={styles.divider} /> : null}
            <PriceRow row={row} animate={ANIMATED_KEYS.has(row.key)} />
          </React.Fragment>
        );
      })}
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
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 18,
    backgroundColor: CK.surface,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: CK.textMuted,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 14,
  },
  divider: {
    marginTop: 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  totalRow: {
    paddingTop: 14,
    paddingBottom: 2,
  },
  strikeRow: {
    paddingVertical: 4,
  },
  labelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: CK.textSecondary,
    flexShrink: 1,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.2,
  },
  strikeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: CK.textMuted,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.26)',
  },
  badgeTxt: { fontSize: 10.5, fontWeight: '900', color: CK.accent },
  badgeHiEmooo: {
    borderRadius: 999,
    backgroundColor: '#A855F7',
    borderWidth: 0,
    paddingHorizontal: 9,
  },
  badgeHiEmoooTxt: {
    color: '#FFFFFF',
  },
  val: {
    fontSize: 15,
    fontWeight: '700',
    color: CK.text,
  },
  strike: {
    fontSize: 13,
    textDecorationLine: 'line-through',
    color: CK.textMuted,
    fontWeight: '600',
  },
  green: { color: CK.accent },
  red: { color: CK.offer },
  totalTxt: { fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
});
