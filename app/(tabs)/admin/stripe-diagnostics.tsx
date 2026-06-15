import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { isAdminUser } from '@/constants/adminUid';
import { useAuth } from '@/services/AuthContext';
import {
  fetchStripeAccountDiagnostics,
  type StripeAccountDiagnosticsPayload,
} from '@/services/adminStripeTreasury';
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

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, ok ? styles.statusOk : styles.statusBad]} />
      <View style={styles.statusCopy}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusValue}>{ok ? 'Yes' : 'No'}</Text>
        {detail ? <Text style={styles.statusDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export default function AdminStripeDiagnosticsScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const isAdmin = isAdminUser(user, firestoreUserRole);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StripeAccountDiagnosticsPayload | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isAdmin) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const payload = await fetchStripeAccountDiagnostics();
      setData(payload);
      setError(null);
    } catch (e) {
      setError(getReadableErrorMessageOr(e, 'Could not load Stripe diagnostics.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const hasWarnings = (data?.warnings.length ?? 0) > 0;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Stripe Setup"
        subtitle="HalfOrder treasury diagnostics"
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
            onPress={() => router.push(adminRoutes.payments as never)}
          >
            <Text style={styles.navChipText}>Payments</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push(adminRoutes.revenue as never)}
          >
            <Text style={styles.navChipText}>Revenue</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push(adminRoutes.payouts as never)}
          >
            <Text style={styles.navChipText}>Payouts</Text>
          </Pressable>
          <Pressable style={[styles.navChip, styles.navChipActive]}>
            <Text style={[styles.navChipText, styles.navChipTextActive]}>Stripe setup</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : data ? (
          <>
            {hasWarnings ? (
              <View style={styles.warnCard}>
                <Text style={styles.warnTitle}>Action required</Text>
                {data.warnings.map((warning) => (
                  <Text key={warning} style={styles.warnLine}>
                    • {warning}
                  </Text>
                ))}
              </View>
            ) : (
              <View style={styles.okCard}>
                <Text style={styles.okTitle}>Stripe treasury is ready</Text>
                <Text style={styles.okBody}>
                  Customer payments flow into the HalfOrder Stripe account, then to your
                  linked bank via payouts.
                </Text>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Account status</Text>
              <StatusRow
                label="Stripe account connected"
                ok={data.stripeAccountConnected}
              />
              <StatusRow
                label="Live mode"
                ok={data.liveMode}
                detail={data.liveMode ? 'sk_live_ key' : 'Test mode (sk_test_)'}
              />
              <StatusRow
                label="Bank account connected"
                ok={data.bankAccountConnected}
              />
              <StatusRow label="Payouts enabled" ok={data.payoutsEnabled} />
              <StatusRow label="Charges enabled" ok={data.chargesEnabled} />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Account details</Text>
              <Text style={styles.metaLine}>Account ID: {data.accountId ?? '—'}</Text>
              <Text style={styles.metaLine}>
                Default currency: {data.defaultCurrency?.toUpperCase() ?? '—'}
              </Text>
              <Text style={styles.metaLine}>Country: {data.country ?? '—'}</Text>
              <Text style={styles.metaMuted}>
                Last checked {new Date(data.fetchedAtMs).toLocaleString()}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Payment flow</Text>
              <Text style={styles.flowLine}>Customer pays via Stripe</Text>
              <Text style={styles.flowArrow}>↓</Text>
              <Text style={styles.flowLine}>HalfOrder Stripe balance</Text>
              <Text style={styles.flowArrow}>↓</Text>
              <Text style={styles.flowLine}>Admin linked bank account</Text>
            </View>
          </>
        ) : null}
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
  card: { ...adminCardShell },
  warnCard: {
    ...adminCardShell,
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  okCard: {
    ...adminCardShell,
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  warnTitle: { fontSize: 16, fontWeight: '800', color: '#9a3412', marginBottom: 8 },
  warnLine: { fontSize: 14, color: '#9a3412', marginBottom: 4 },
  okTitle: { fontSize: 16, fontWeight: '800', color: '#166534', marginBottom: 6 },
  okBody: { fontSize: 14, color: '#166534', lineHeight: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  statusRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  statusDot: { width: 12, height: 12, borderRadius: 999, marginTop: 4 },
  statusOk: { backgroundColor: '#16a34a' },
  statusBad: { backgroundColor: '#dc2626' },
  statusCopy: { flex: 1 },
  statusLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  statusValue: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  statusDetail: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  metaLine: { fontSize: 14, color: COLORS.text, marginBottom: 6 },
  metaMuted: { fontSize: 12, color: COLORS.textMuted, marginTop: 8 },
  flowLine: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  flowArrow: { fontSize: 18, color: COLORS.primary, marginVertical: 4, textAlign: 'center' },
  errorText: { color: '#b91c1c', fontWeight: '600' },
});
