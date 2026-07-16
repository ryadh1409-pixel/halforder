import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminStatCard } from '@/components/AdminStatCard';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { isAdminUser } from '@/constants/adminUid';
import { useAuth } from '@/services/AuthContext';
import {
  fetchAdminStripePayouts,
  formatPayoutDate,
  formatPayoutDateTime,
  formatPayoutMoney,
  type AdminStripePayoutsPayload,
} from '@/services/adminStripePayouts';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function statusStyle(status: string) {
  if (status === 'paid') return styles.statusPaid;
  if (status === 'failed' || status === 'canceled') return styles.statusFailed;
  if (status === 'pending' || status === 'in_transit') return styles.statusPending;
  return null;
}

export default function AdminPayoutsScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const isAdmin = isAdminUser(user, firestoreUserRole);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminStripePayoutsPayload | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isAdmin) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const payload = await fetchAdminStripePayouts();
      setData(payload);
      setError(null);
    } catch (e) {
      setError(getReadableErrorMessageOr(e, 'Could not load Stripe payouts.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const currency = data?.currency ?? 'cad';

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Payouts"
        subtitle="Finance · live Stripe balance (HalfOrder treasury)"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={COLORS.primary}
          />
        }
      >
        <View style={styles.financeNav}>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push('/(tabs)/admin/payments' as never)}
          >
            <Text style={styles.navChipText}>Payments</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push('/(tabs)/admin/revenue' as never)}
          >
            <Text style={styles.navChipText}>Revenue</Text>
          </Pressable>
          <Pressable style={[styles.navChip, styles.navChipActive]}>
            <Text style={[styles.navChipText, styles.navChipTextActive]}>Payouts</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push('/(tabs)/admin/transactions' as never)}
          >
            <Text style={styles.navChipText}>Transactions</Text>
          </Pressable>
        </View>

        {!isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>Admin access required.</Text>
          </View>
        ) : loading && !data ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.refreshBtn} onPress={() => void load(false)}>
              <Text style={styles.refreshBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            <View style={styles.statsGrid}>
              <AdminStatCard
                label="Available Balance"
                value={formatPayoutMoney(data.availableBalance, currency)}
                hint="Stripe available"
              />
              <AdminStatCard
                label="Pending Balance"
                value={formatPayoutMoney(data.pendingBalance, currency)}
                hint="Processing / in transit"
              />
              <AdminStatCard
                label="Lifetime Revenue"
                value={formatPayoutMoney(data.lifetimeRevenue, currency)}
                hint="Paid transactions ledger"
              />
              <AdminStatCard
                label="Next Payout"
                value={
                  data.nextPayoutAmount != null
                    ? formatPayoutMoney(data.nextPayoutAmount, data.nextPayoutCurrency ?? currency)
                    : '—'
                }
                hint={
                  data.nextPayoutDateMs
                    ? formatPayoutDate(data.nextPayoutDateMs)
                    : 'No scheduled payout'
                }
              />
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.sectionTitle}>Recent Payouts</Text>
                <Pressable style={styles.refreshBtn} onPress={() => void load(true)}>
                  <Text style={styles.refreshBtnText}>
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                  </Text>
                </Pressable>
              </View>
              {data.recentPayouts.length === 0 ? (
                <Text style={styles.muted}>No payouts recorded yet.</Text>
              ) : (
                <View style={styles.table}>
                  <View style={[styles.row, styles.headerRow]}>
                    <Text style={[styles.cell, styles.headerCell, styles.colDate]}>Date</Text>
                    <Text style={[styles.cell, styles.headerCell, styles.colAmount]}>Amount</Text>
                    <Text style={[styles.cell, styles.headerCell, styles.colStatus]}>Status</Text>
                    <Text style={[styles.cell, styles.headerCell, styles.colArrival]}>Arrival</Text>
                    <Text style={[styles.cell, styles.headerCell, styles.colBank]}>Bank</Text>
                  </View>
                  {data.recentPayouts.map((row) => (
                    <View key={row.id} style={styles.row}>
                      <View style={styles.colDate}>
                        <Text style={styles.cell}>{formatPayoutDate(row.createdMs)}</Text>
                        <Text style={styles.subCell}>{formatPayoutDateTime(row.createdMs)}</Text>
                      </View>
                      <Text style={[styles.cell, styles.colAmount]}>
                        {formatPayoutMoney(row.amount, row.currency)}
                      </Text>
                      <Text style={[styles.cell, styles.colStatus, statusStyle(row.status)]}>
                        {row.statusLabel}
                      </Text>
                      <Text style={[styles.cell, styles.colArrival]}>
                        {formatPayoutDate(row.arrivalMs)}
                      </Text>
                      <Text style={[styles.cell, styles.colBank]} numberOfLines={2}>
                        {row.bankAccount}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.fetchedAt}>
                Last updated {formatPayoutDateTime(data.fetchedAtMs)}
              </Text>
            </View>
          </>
        ) : null}
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
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  card: { ...adminCardShell, marginBottom: 12 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  muted: { color: COLORS.textMuted, fontSize: 14 },
  errorText: { color: COLORS.error, fontSize: 14, marginBottom: 10 },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
  },
  refreshBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  headerRow: { backgroundColor: '#FFFFFF' },
  headerCell: { fontWeight: '800', color: COLORS.textMuted, fontSize: 11 },
  cell: { color: COLORS.text, fontSize: 12 },
  subCell: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  colDate: { width: 92 },
  colAmount: { width: 78, textAlign: 'right' },
  colStatus: { width: 72, textAlign: 'right', fontWeight: '700' },
  colArrival: { width: 82 },
  colBank: { flex: 1, minWidth: 90 },
  statusPaid: { color: COLORS.primary },
  statusPending: { color: '#b45309' },
  statusFailed: { color: COLORS.error },
  fetchedAt: { marginTop: 10, fontSize: 11, color: COLORS.textMuted },
});
