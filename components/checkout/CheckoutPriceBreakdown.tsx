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
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: CK.textSecondary,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 16,
  },
  divider: {
    marginTop: 6,
    marginBottom: 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  totalRow: {
    paddingTop: 14,
    paddingBottom: 4,
    alignItems: 'baseline',
  },
  strikeRow: {
    paddingVertical: 6,
  },
  labelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: CK.textSecondary,
    flexShrink: 1,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: CK.textSecondary,
    letterSpacing: -0.1,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,197,94,0.22)',
  },
  badgeTxt: { fontSize: 10.5, fontWeight: '800', color: CK.accent },
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
    fontSize: 14,
    fontWeight: '600',
    color: CK.text,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  strike: {
    fontSize: 13,
    textDecorationLine: 'line-through',
    color: CK.textMuted,
    fontWeight: '600',
  },
  green: { color: CK.accent },
  red: { color: CK.offer },
  totalTxt: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: CK.text,
    fontVariant: ['tabular-nums'],
  },
});
