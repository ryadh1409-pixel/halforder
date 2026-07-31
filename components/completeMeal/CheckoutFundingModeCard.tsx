import { CK } from '@/constants/checkoutUi';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type CheckoutFundingMode = 'full' | 'complete_meal';

type Props = {
  mode: CheckoutFundingMode;
  onChange: (mode: CheckoutFundingMode) => void;
  /** When false, only the Complete Checkout heading is shown. Defaults to false. */
  showCompleteMeal?: boolean;
};

function CheckoutFundingModeCardInner({
  mode,
  onChange,
  showCompleteMeal = false,
}: Props) {
  if (!showCompleteMeal) {
    return (
      <View style={styles.headingOnly}>
        <Text style={styles.title}>Complete Checkout</Text>
        <Text style={styles.subtitle}>
          Review your order, then continue to pay securely
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Complete Checkout</Text>
      <Pressable
        style={[styles.row, mode === 'full' && styles.rowOn]}
        onPress={() => onChange('full')}
        accessibilityRole="radio"
        accessibilityState={{ selected: mode === 'full' }}
      >
        <View style={[styles.radio, mode === 'full' && styles.radioOn]}>
          {mode === 'full' ? <View style={styles.radioDot} /> : null}
        </View>
        <View style={styles.copy}>
          <Text style={styles.line1}>Pay in full</Text>
          <Text style={styles.line2}>Place your order and pay now</Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.row, mode === 'complete_meal' && styles.rowOn]}
        onPress={() => onChange('complete_meal')}
        accessibilityRole="radio"
        accessibilityState={{ selected: mode === 'complete_meal' }}
      >
        <View
          style={[styles.radio, mode === 'complete_meal' && styles.radioOn]}
        >
          {mode === 'complete_meal' ? <View style={styles.radioDot} /> : null}
        </View>
        <View style={styles.copy}>
          <View style={styles.badgeRow}>
            <Text style={styles.line1}>Complete My Meal</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>NEW</Text>
            </View>
          </View>
          <Text style={styles.line2}>
            Pay part now — invite friends to finish the rest
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export const CheckoutFundingModeCard = memo(CheckoutFundingModeCardInner);

const styles = StyleSheet.create({
  headingOnly: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 4,
  },
  wrap: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 4,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: CK.textMuted,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(18,16,26,0.4)',
    minHeight: 64,
  },
  rowOn: {
    borderColor: 'rgba(168,85,247,0.45)',
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(183,189,201,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: CK.blackBtn,
    backgroundColor: 'transparent',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: CK.blackBtn,
  },
  copy: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line1: {
    fontSize: 15,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.2,
  },
  line2: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: CK.textSecondary,
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: CK.blackBtn,
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
