import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { formatCurrency } from '@/services/finance/financeAnalytics';
import type { FinanceRevenuePoint } from '@/types/financeDashboard';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  points: FinanceRevenuePoint[];
};

/** Simple bar chart matching existing Admin Revenue style (no new chart deps). */
export function FinanceBarChart({ title, points }: Props) {
  const max = Math.max(...points.map((p) => p.revenue), 1);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {points.length === 0 ? (
        <Text style={styles.empty}>No data in range</Text>
      ) : (
        points.map((p) => (
          <View key={p.label} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              {p.label}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.max(4, (p.revenue / max) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.value}>{formatCurrency(p.revenue)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 12,
  },
  empty: { color: COLORS.textMuted, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  label: { width: 64, color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  track: {
    flex: 1,
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(168,85,247,0.12)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  value: {
    width: 72,
    textAlign: 'right',
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
});
