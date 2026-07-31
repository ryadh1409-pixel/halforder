import {
  disconnectRestaurantStripeAccount,
  fetchRestaurantPayoutBankDetails,
  startOnboarding,
  type RestaurantPayoutBankDetails,
} from '@/services/stripeConnect';
import { getUserFriendlyError } from '@/services/errors';
import { stripeConnectErrorMessage } from '@/utils/stripeConnectErrors';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#16a34a';
const PAGE = '#FFFFFF';

function maskIban(last4: string | null | undefined): string {
  if (!last4) return '•••• •••• •••• ••••';
  return `•••• •••• •••• ${last4}`;
}

function maskAccount(last4: string | null | undefined): string {
  if (!last4) return '••••••••';
  return `••••${last4}`;
}

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function RestaurantBankAccountScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<RestaurantPayoutBankDetails | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchRestaurantPayoutBankDetails();
      setDetails(next);
    } catch (e) {
      console.warn('[bank-account] load failed', e);
      setDetails({ connected: false });
      const msg = stripeConnectErrorMessage(e);
      // Only toast for real network/server failures — empty state handles "not connected".
      if (
        msg.toLowerCase().includes('connection') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('try again')
      ) {
        showError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openStripeOnboarding = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { url } = await startOnboarding();
      if (url) await Linking.openURL(url);
      showSuccess('Continue in Stripe, then return here.');
      setTimeout(() => void load(), 1200);
    } catch (e) {
      showError(stripeConnectErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [busy, load]);

  const confirmDisconnect = useCallback(() => {
    Alert.alert(
      'Disconnect bank account?',
      'Payouts will stop until you connect a bank account again. Your Stripe account is not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await disconnectRestaurantStripeAccount();
                setDetails({ connected: false });
                showSuccess('Bank account disconnected.');
              } catch (e) {
                showError(getUserFriendlyError(e));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.muted}>Loading bank account…</Text>
      </SafeAreaView>
    );
  }

  const connected = details?.connected === true;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Bank Account</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!connected ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={36} color={PRIMARY} />
            </View>
            <Text style={styles.emptyTitle}>No bank account connected.</Text>
            <Text style={styles.emptyBody}>
              Connect a bank account through Stripe to receive restaurant payouts securely.
            </Text>
            <Pressable
              style={[styles.primaryBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void openStripeOnboarding()}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Connect Bank Account</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payout details</Text>
              <DetailRow label="Bank name" value={details?.bankName ?? 'Connected bank'} />
              <DetailRow
                label="Account holder"
                value={details?.accountHolderName ?? '—'}
              />
              <DetailRow label="IBAN" value={maskIban(details?.last4)} />
              <DetailRow label="Account number" value={maskAccount(details?.last4)} />
              <DetailRow label="Currency" value={details?.currency ?? 'CAD'} />
              <DetailRow label="Country" value={details?.country ?? 'CA'} />
              <DetailRow label="Account status" value={details?.accountStatus ?? '—'} />
              <DetailRow
                label="Last payout"
                value={formatDateLabel(details?.lastPayoutDate)}
              />
              <DetailRow
                label="Next payout"
                value={details?.nextPayoutEstimate?.trim() || '—'}
              />
            </View>

            <Pressable
              style={[styles.secondaryBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void openStripeOnboarding()}
            >
              <Text style={styles.secondaryBtnText}>Edit bank account</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void openStripeOnboarding()}
            >
              <Text style={styles.secondaryBtnText}>Replace bank account</Text>
            </Pressable>
            <Pressable
              style={[styles.dangerBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={confirmDisconnect}
            >
              <Text style={styles.dangerBtnText}>Disconnect bank account</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PAGE,
    gap: 10,
  },
  muted: { color: '#64748b', fontWeight: '600' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 24,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(22,163,74,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  rowLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', flex: 1 },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1.2,
    textAlign: 'right',
  },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#635BFF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#0F172A', fontWeight: '800', fontSize: 15 },
  dangerBtn: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { color: '#B91C1C', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.55 },
});
