import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  formatWalletLocalDate,
  formatWalletLocalTime,
  formatWalletMoney,
} from '@/lib/earningsWalletFormat';
import { subscribeEarningsLedgerEntry } from '@/services/earningsWallet';
import type { UserRole } from '@/services/userService';
import type { EarningsLedgerEntry } from '@/types/earningsWallet';
import { useRequireRole } from '@/utils/requireRole';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Stable role list — never recreate between renders. */
const ADMIN_ROLES: UserRole[] = ['admin'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function AdminWalletTransactionScreen() {
  // All hooks must run unconditionally on every render (Rules of Hooks).
  const { authorized, loading: roleLoading } = useRequireRole(ADMIN_ROLES);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const [entry, setEntry] = useState<EarningsLedgerEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const rawId = params.id;
  const idValue = Array.isArray(rawId) ? rawId[0] : rawId;
  const id = typeof idValue === 'string' ? idValue.trim() : '';

  useEffect(() => {
    if (!authorized || !id) return undefined;
    return subscribeEarningsLedgerEntry(
      id,
      (e) => {
        setEntry(e);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [authorized, id]);

  // Conditional UI only — after every hook above has already run.
  if (roleLoading || !authorized) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title="Transaction Details" fallbackRoute={adminRoutes.wallet} />
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : !entry ? (
        <Text style={styles.empty}>Transaction not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Row label="Transaction ID" value={entry.id} />
          <Row label="Amount" value={formatWalletMoney(entry.signedAmount)} />
          <Row label="Type" value={entry.type} />
          <Row
            label="Source"
            value={entry.source ?? entry.adminSnapshot?.source ?? '—'}
          />
          <Row label="Status" value={entry.status} />
          <Row label="Date" value={formatWalletLocalDate(entry.createdAt)} />
          <Row label="Time" value={formatWalletLocalTime(entry.createdAt)} />
          <Row
            label="Reference ID"
            value={entry.referenceId ?? entry.adminSnapshot?.referenceId ?? '—'}
          />
          <Row label="Order ID" value={entry.orderId ?? '—'} />
          <Row
            label="Notes"
            value={entry.note ?? entry.notes ?? entry.reason ?? '—'}
          />
          {entry.reason ? <Row label="Reason" value={entry.reason} /> : null}
          {entry.walletType ? (
            <Row label="Wallet Type" value={entry.walletType} />
          ) : null}
          {entry.walletOwnerId ? (
            <Row label="Wallet Owner" value={entry.walletOwnerId} />
          ) : null}
          {entry.customerUid ? (
            <Row label="Customer UID" value={entry.customerUid} />
          ) : null}
          {entry.previousBalance != null ? (
            <Row
              label="Previous Balance"
              value={formatWalletMoney(entry.previousBalance)}
            />
          ) : null}
          {entry.newBalance != null ? (
            <Row
              label="New Balance"
              value={formatWalletMoney(entry.newBalance)}
            />
          ) : null}
          {entry.adjustmentAmount != null ? (
            <Row
              label="Adjustment Amount"
              value={formatWalletMoney(entry.adjustmentAmount)}
            />
          ) : null}
          {entry.adminUid || entry.createdBy ? (
            <Row
              label="Admin UID"
              value={entry.adminUid ?? entry.createdBy ?? '—'}
            />
          ) : null}
          <Row
            label="Balance After Transaction"
            value={formatWalletMoney(entry.balanceAfter ?? entry.runningBalance)}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  row: {
    backgroundColor: '#151022',
    borderRadius: 10,
    padding: 12,
  },
  label: { color: '#8A829E', fontSize: 12, fontWeight: '600' },
  value: { color: '#F5F3FF', fontSize: 15, fontWeight: '600', marginTop: 4 },
  empty: { color: '#8A829E', padding: 20 },
});
