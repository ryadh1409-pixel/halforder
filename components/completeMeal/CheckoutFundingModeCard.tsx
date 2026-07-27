import { CK } from '@/constants/checkoutUi';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type CheckoutFundingMode = 'full' | 'complete_meal';

type Props = {
  mode: CheckoutFundingMode;
  onChange: (mode: CheckoutFundingMode) => void;
};

function CheckoutFundingModeCardInner({ mode, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Payment Method</Text>
      <Pressable
        style={[styles.row, mode === 'full' && styles.rowOn]}
        onPress={() => onChange('full')}
        accessibilityRole="radio"
        accessibilityState={{ selected: mode === 'full' }}
      >
        <View style={[styles.radio, mode === 'full' && styles.radioOn]} />
        <View style={styles.copy}>
          <Text style={styles.line1}>Pay Full Amount</Text>
          <Text style={styles.line2}>Place your order and pay now</Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.row, mode === 'complete_meal' && styles.rowOn]}
        onPress={() => onChange('complete_meal')}
        accessibilityRole="radio"
        accessibilityState={{ selected: mode === 'complete_meal' }}
      >
        <View style={[styles.radio, mode === 'complete_meal' && styles.radioOn]} />
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
  wrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.bg,
    gap: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: CK.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: CK.surface2,
  },
  rowOn: {
    borderColor: CK.blackBtn,
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: CK.textMuted,
    marginTop: 2,
  },
  radioOn: {
    borderColor: CK.blackBtn,
    backgroundColor: CK.blackBtn,
  },
  copy: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line1: { fontSize: 15.5, fontWeight: '900', color: CK.text },
  line2: { marginTop: 3, fontSize: 13, fontWeight: '600', color: CK.textSecondary },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: CK.blackBtn,
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
});
