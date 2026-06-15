import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminStatCard } from '@/components/AdminStatCard';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  buildDailyRevenueBuckets,
  buildTopFoodCards,
  buildTopRestaurants,
  fetchAdminPaymentTransactions,
  formatCurrency,
  summarizeAdminPayments,
} from '@/services/adminPaymentCenter';
import {
  fetchStripeTreasurySummary,
  formatTreasuryMoney,
  type StripeTreasurySummaryPayload,
} from '@/services/adminStripeTreasury';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function AdminRevenueScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAdminPaymentTransactions>>>([]);
  const [treasury, setTreasury] = useState<StripeTreasurySummaryPayload | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [txRows, summary] = await Promise.all([
        fetchAdminPaymentTransactions(),
        fetchStripeTreasurySummary(),
      ]);
      setRows(txRows);
      setTreasury(summary);
      setError(null);
    } catch (e) {
      setError(getReadableErrorMessageOr(e, 'Could not load revenue data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const summary = useMemo(() => summarizeAdminPayments(rows), [rows]);
  const daily = useMemo(() => buildDailyRevenueBuckets(rows), [rows]);
  const topCards = useMemo(() => buildTopFoodCards(rows), [rows]);
  const topRestaurants = useMemo(() => buildTopRestaurants(rows), [rows]);
  const maxDaily = Math.max(...daily.map((b) => b.revenue), 1);
  const currency = treasury?.currency ?? 'cad';

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader title="Revenue Analytics" subtitle="Finance · Stripe treasury overview" />
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
            onPress={() => router.push(adminRoutes.payments as never)}
          >
            <Text style={styles.navChipText}>Payments</Text>
          </Pressable>
          <Pressable style={[styles.navChip, styles.navChipActive]}>
            <Text style={[styles.navChipText, styles.navChipTextActive]}>Revenue</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push(adminRoutes.payouts as never)}
          >
            <Text style={styles.navChipText}>Payouts</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push(adminRoutes.transactions as never)}
          >
            <Text style={styles.navChipText}>Transactions</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push(adminRoutes.stripeDiagnostics as never)}
          >
            <Text style={styles.navChipText}>Stripe setup</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <>
            <View style={styles.statsGrid}>
              <AdminStatCard
                label="Available balance"
                value={formatTreasuryMoney(treasury?.availableBalance, currency)}
              />
              <AdminStatCard
                label="Pending balance"
                value={formatTreasuryMoney(treasury?.pendingBalance, currency)}
              />
              <AdminStatCard
                label="Today"
                value={formatTreasuryMoney(treasury?.todayRevenue, currency)}
              />
              <AdminStatCard
                label="This week"
                value={formatTreasuryMoney(treasury?.weekRevenue, currency)}
              />
              <AdminStatCard
                label="This month"
                value={formatTreasuryMoney(treasury?.monthRevenue, currency)}
              />
              <AdminStatCard
                label="Lifetime"
                value={formatTreasuryMoney(treasury?.lifetimeRevenue, currency)}
              />
            </View>

            <View style={styles.statsGrid}>
              <AdminStatCard
                label="Successful"
                value={String(treasury?.successfulPayments ?? 0)}
              />
              <AdminStatCard
                label="Pending"
                value={String(treasury?.pendingPayments ?? 0)}
              />
              <AdminStatCard
                label="Failed"
                value={String(treasury?.failedPayments ?? 0)}
              />
              <AdminStatCard
                label="Refunded"
                value={String(treasury?.refundedPayments ?? 0)}
              />
            </View>

            <View style={styles.statsGrid}>
              <AdminStatCard label="Food Share Revenue" value={formatCurrency(summary.foodShareRevenue)} />
              <AdminStatCard label="Delivery Revenue" value={formatCurrency(summary.deliveryRevenue)} />
              <AdminStatCard label="Platform Fees" value={formatCurrency(summary.platformFees)} />
              <AdminStatCard label="Gross Revenue" value={formatCurrency(summary.grossRevenue)} />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Daily Revenue (14 days)</Text>
              {daily.map((bucket) => (
                <View key={bucket.label} style={styles.barRow}>
                  <Text style={styles.barLabel}>{bucket.label}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.max(4, (bucket.revenue / maxDaily) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barValue}>{formatCurrency(bucket.revenue)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Top Food Cards</Text>
              {topCards.length === 0 ? (
                <Text style={styles.muted}>No food-share payments yet.</Text>
              ) : (
                topCards.map((card) => (
                  <View key={card.adminFoodShareId} style={styles.rankRow}>
                    <Text style={styles.rankName}>{card.name}</Text>
                    <Text style={styles.rankMeta}>
                      {formatCurrency(card.revenue)} · {card.count} payments
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Top Restaurants</Text>
              {topRestaurants.length === 0 ? (
                <Text style={styles.muted}>No restaurant payments yet.</Text>
              ) : (
                topRestaurants.map((row) => (
                  <View key={row.restaurantId} style={styles.rankRow}>
                    <Text style={styles.rankName}>{row.name}</Text>
                    <Text style={styles.rankMeta}>
                      {formatCurrency(row.revenue)} · {row.count} payments
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  financeNav: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
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
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { ...adminCardShell },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { width: 56, fontSize: 11, color: COLORS.textMuted },
  barTrack: { flex: 1, height: 10, backgroundColor: '#eef2f7', borderRadius: 999 },
  barFill: { height: 10, backgroundColor: COLORS.primary, borderRadius: 999 },
  barValue: { width: 72, textAlign: 'right', fontSize: 12, color: COLORS.text },
  rankRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rankName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rankMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  muted: { color: COLORS.textMuted },
  errorText: { color: '#b91c1c', fontWeight: '600' },
});
