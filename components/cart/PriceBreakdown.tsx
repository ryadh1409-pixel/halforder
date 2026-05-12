import { RP } from '@/constants/restaurantPremiumTheme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Row = { label: string; value: string; strike?: boolean; accent?: boolean };

type Props = {
  rows: Row[];
};

export function PriceBreakdown({ rows }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Price breakdown</Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text style={[styles.label, r.strike && styles.strike]}>{r.label}</Text>
          <Text
            style={[
              styles.val,
              r.strike && styles.strike,
              r.accent && styles.accent,
            ]}
          >
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 22,
    padding: 16,
    borderRadius: RP.radiusM,
    backgroundColor: RP.surface,
    borderWidth: 1,
    borderColor: RP.border,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: RP.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: { fontSize: 15, fontWeight: '600', color: RP.textSecondary, flex: 1, paddingRight: 12 },
  val: { fontSize: 15, fontWeight: '800', color: RP.text },
  strike: {
    textDecorationLine: 'line-through',
    color: RP.textMuted,
    fontWeight: '600',
  },
  accent: { color: RP.accent },
});
