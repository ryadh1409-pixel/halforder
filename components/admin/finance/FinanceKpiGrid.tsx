import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { formatCurrency } from '@/services/finance/financeAnalytics';
import type { FinanceKpis } from '@/types/financeDashboard';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = { kpis: FinanceKpis };

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FinanceKpiGrid({ kpis }: Props) {
  const items: { label: string; value: string; hint?: string }[] = [
    { label: 'GMV', value: formatCurrency(kpis.gmv) },
    { label: 'Platform Revenue', value: formatCurrency(kpis.platformRevenue) },
    { label: 'Net Revenue', value: formatCurrency(kpis.netRevenue) },
    { label: 'Total Orders', value: String(kpis.totalOrders) },
    { label: 'Completed Orders', value: String(kpis.completedOrders) },
    { label: 'Active Orders', value: String(kpis.activeOrders) },
    { label: 'Cancelled Orders', value: String(kpis.cancelledOrders) },
    { label: 'Failed Orders', value: String(kpis.failedOrders) },
    { label: 'Total Refunds', value: formatCurrency(kpis.totalRefundsAmount) },
    { label: 'Pending Refunds', value: String(kpis.pendingRefundsCount) },
    { label: 'Successful Payments', value: String(kpis.successfulPayments) },
    { label: 'Failed Payments', value: String(kpis.failedPayments) },
    { label: 'Avg Order Value', value: formatCurrency(kpis.averageOrderValue) },
    { label: 'Avg Split Value', value: formatCurrency(kpis.averageSplitValue) },
  ];

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <Card key={item.label} {...item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  card: {
    ...adminCardShell,
    width: '47%',
    flexGrow: 1,
    minWidth: 140,
    marginBottom: 0,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 6,
  },
  hint: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
});
