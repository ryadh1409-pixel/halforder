import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminStatCard } from '@/components/AdminStatCard';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  fetchAdminPaymentTransactions,
  filterAdminPayments,
  formatCurrency,
  formatPaymentCard,
  formatPaymentStatusLabel,
  paymentTransactionsToCsv,
  summarizeAdminPayments,
  type AdminPaymentDateFilter,
} from '@/services/adminPaymentCenter';
import type { AdminPaymentTransaction } from '@/types/adminPaymentTransaction';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatDateTime(ms: number | null): { date: string; time: string } {
  if (!ms) return { date: '—', time: '—' };
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString(),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function AdminPaymentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminPaymentTransaction[]>([]);
  const [filter, setFilter] = useState<AdminPaymentDateFilter>('30d');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPaymentTransactions();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeAdminPayments(rows), [rows]);
  const filtered = useMemo(
    () => filterAdminPayments(rows, filter, search),
    [rows, filter, search],
  );

  async function exportCsv() {
    const csv = paymentTransactionsToCsv(filtered);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `halforder-payments-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    await Share.share({ message: csv, title: 'HalfOrder payments export' });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Stripe Payments Center"
        subtitle="Finance · all swipe-order and food-share payments"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.financeNav}>
          <Pressable style={[styles.navChip, styles.navChipActive]}>
            <Text style={[styles.navChipText, styles.navChipTextActive]}>Payments</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push('/(tabs)/admin/revenue' as never)}
          >
            <Text style={styles.navChipText}>Revenue</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push('/(tabs)/admin/payouts' as never)}
          >
            <Text style={styles.navChipText}>Payouts</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push('/(tabs)/admin/transactions' as never)}
          >
            <Text style={styles.navChipText}>Transactions</Text>
          </Pressable>
        </View>

        <View style={styles.statsGrid}>
          <AdminStatCard label="Gross Revenue" value={formatCurrency(summary.grossRevenue)} />
          <AdminStatCard label="Today" value={formatCurrency(summary.revenueToday)} />
          <AdminStatCard label="This Week" value={formatCurrency(summary.revenueThisWeek)} />
          <AdminStatCard label="This Month" value={formatCurrency(summary.revenueThisMonth)} />
          <AdminStatCard label="Successful" value={String(summary.successfulCount)} />
          <AdminStatCard label="Pending" value={String(summary.pendingCount)} />
          <AdminStatCard label="Refunded" value={String(summary.refundedCount)} />
          <AdminStatCard label="Disputed" value={String(summary.disputedCount)} />
        </View>

        <View style={styles.toolbar}>
          <View style={styles.filters}>
            {(
              [
                ['today', 'Today'],
                ['7d', '7 Days'],
                ['30d', '30 Days'],
                ['all', 'All'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                style={[styles.chip, filter === key && styles.chipActive]}
                onPress={() => setFilter(key)}
              >
                <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.exportBtn} onPress={() => void exportCsv()}>
            <Text style={styles.exportBtnText}>Export CSV</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search customer, orderId, matchId, paymentIntent…"
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No payments yet</Text>
            <Text style={styles.emptySub}>
              New Stripe payments will appear here after webhook processing.
            </Text>
          </View>
        ) : (
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.headerCell, styles.colDate]}>Date</Text>
              <Text style={[styles.cell, styles.headerCell, styles.colTime]}>Time</Text>
              <Text style={[styles.cell, styles.headerCell, styles.colCard]}>Card</Text>
              <Text style={[styles.cell, styles.headerCell, styles.colAmount]}>Amount</Text>
              <Text style={[styles.cell, styles.headerCell, styles.colCustomer]}>Customer</Text>
              <Text style={[styles.cell, styles.headerCell, styles.colOrder]}>Order</Text>
              <Text style={[styles.cell, styles.headerCell, styles.colMatch]}>Match</Text>
              <Text style={[styles.cell, styles.headerCell, styles.colStatus]}>Status</Text>
            </View>
            {filtered.map((row) => {
              const { date, time } = formatDateTime(row.paidAtMs ?? row.createdAtMs);
              return (
                <Pressable
                  key={row.id}
                  style={styles.row}
                  onPress={() =>
                    router.push(`/(tabs)/admin/payments/${encodeURIComponent(row.id)}` as never)
                  }
                >
                  <Text style={[styles.cell, styles.colDate]}>{date}</Text>
                  <Text style={[styles.cell, styles.colTime]}>{time}</Text>
                  <Text style={[styles.cell, styles.colCard]} numberOfLines={1}>
                    {formatPaymentCard(row)}
                  </Text>
                  <Text style={[styles.cell, styles.colAmount]}>
                    {formatCurrency(row.amount, row.currency)}
                  </Text>
                  <Text style={[styles.cell, styles.colCustomer]} numberOfLines={1}>
                    {row.customerName ?? row.customerId}
                  </Text>
                  <Text style={[styles.cell, styles.colOrder]} numberOfLines={1}>
                    {row.orderId ?? '—'}
                  </Text>
                  <Text style={[styles.cell, styles.colMatch]} numberOfLines={1}>
                    {row.matchId ?? '—'}
                  </Text>
                  <Text
                    style={[
                      styles.cell,
                      styles.colStatus,
                      row.status === 'paid' && styles.statusPaid,
                      row.status === 'refunded' && styles.statusRefund,
                      row.status === 'failed' && styles.statusFailed,
                    ]}
                  >
                    {formatPaymentStatusLabel(row.status)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={styles.refreshBtn}
          onPress={() => void load()}
        >
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  financeNav: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  navChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  navChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  navChipText: { color: COLORS.text, fontWeight: '600', fontSize: 13 },
  navChipTextActive: { color: COLORS.onPrimary },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: '#ecfdf5', borderColor: COLORS.primary },
  chipText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 12 },
  chipTextActive: { color: COLORS.primary },
  exportBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  exportBtnText: { color: COLORS.onPrimary, fontWeight: '700', fontSize: 13 },
  search: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    color: COLORS.text,
    fontSize: 15,
  },
  table: { ...adminCardShell, padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  headerRow: { backgroundColor: COLORS.card },
  headerCell: { fontWeight: '800', color: COLORS.textMuted, fontSize: 11 },
  cell: { color: COLORS.text, fontSize: 13 },
  subCell: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  colDate: { width: 88 },
  colTime: { width: 72 },
  colCard: { width: 118 },
  colAmount: { width: 72, textAlign: 'right' },
  colCustomer: { flex: 1, minWidth: 90 },
  colOrder: { width: 88 },
  colMatch: { width: 88 },
  colStatus: { width: 72, textAlign: 'right', fontWeight: '700' },
  statusPaid: { color: COLORS.primary },
  statusRefund: { color: '#b45309' },
  statusFailed: { color: COLORS.error },
  empty: { ...adminCardShell, alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptySub: { marginTop: 8, color: COLORS.textMuted, textAlign: 'center' },
  refreshBtn: { alignSelf: 'center', marginTop: 16, padding: 10 },
  refreshBtnText: { color: COLORS.primary, fontWeight: '700' },
});
