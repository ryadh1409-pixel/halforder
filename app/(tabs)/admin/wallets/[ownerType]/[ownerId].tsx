import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { PartnerHalfOrderBalanceCard } from '@/components/partnerWallet/PartnerHalfOrderBalanceCard';
import { PartnerWalletCreditHistory } from '@/components/partnerWallet/PartnerWalletCreditHistory';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  sendPartnerWalletBalance,
  subscribePartnerWallet,
  subscribePartnerWalletCredits,
} from '@/services/halfOrderPartnerWallet';
import { useAuth } from '@/services/AuthContext';
import type {
  HalfOrderPartnerWallet,
  HalfOrderPartnerWalletCredit,
  PartnerWalletOwnerType,
} from '@/types/halfOrderPartnerWallet';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function parseOwnerType(raw: unknown): PartnerWalletOwnerType | null {
  if (raw === 'restaurant' || raw === 'driver') return raw;
  return null;
}

export default function AdminPartnerWalletDetailScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const { user } = useAuth();
  const params = useLocalSearchParams<{ ownerType?: string; ownerId?: string }>();
  const ownerType = useMemo(() => parseOwnerType(params.ownerType), [params.ownerType]);
  const ownerId = typeof params.ownerId === 'string' ? params.ownerId : '';

  const [wallet, setWallet] = useState<HalfOrderPartnerWallet | null>(null);
  const [credits, setCredits] = useState<HalfOrderPartnerWalletCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!authorized || !ownerType || !ownerId) return undefined;
    const unsubW = subscribePartnerWallet(
      ownerType,
      ownerId,
      (w) => {
        setWallet(w);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubC = subscribePartnerWalletCredits(ownerType, ownerId, setCredits);
    return () => {
      unsubW();
      unsubC();
    };
  }, [authorized, ownerType, ownerId]);

  const onSend = async () => {
    if (!user?.uid || !ownerType || !ownerId) return;
    const n = Number.parseFloat(amount.trim());
    if (!Number.isFinite(n) || n <= 0) {
      showError('Enter a valid amount greater than zero.');
      return;
    }
    setSending(true);
    try {
      await sendPartnerWalletBalance({
        ownerType,
        ownerId,
        amount: n,
        note,
        actorUid: user.uid,
      });
      showSuccess('Balance added by HalfOrder');
      setAmount('');
      setNote('');
    } catch (err) {
      showError(getUserFriendlyError(err));
    } finally {
      setSending(false);
    }
  };

  if (roleLoading || !authorized) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!ownerType || !ownerId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AdminHeader title="Wallet" fallbackRoute={adminRoutes.wallets} />
        <Text style={styles.empty}>Wallet not found.</Text>
      </SafeAreaView>
    );
  }

  const title =
    ownerType === 'restaurant' ? 'Restaurant Wallet' : 'Driver Wallet';
  const back =
    ownerType === 'restaurant'
      ? adminRoutes.walletsRestaurants
      : adminRoutes.walletsDrivers;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title={title} fallbackRoute={back} />
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.ownerId} numberOfLines={1}>
            {ownerId}
          </Text>

          <PartnerHalfOrderBalanceCard
            balance={wallet?.currentBalance ?? 0}
            updatedAt={wallet?.updatedAt ?? null}
          />

          <View style={styles.sendCard}>
            <Text style={styles.sendTitle}>Send Balance</Text>
            <Text style={styles.sendHelp}>
              Balance added by HalfOrder appears instantly in credit history.
            </Text>
            <Text style={styles.label}>Amount ($)</Text>
            <AppTextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <Text style={styles.label}>Optional Note</Text>
            <AppTextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
            />
            <Pressable
              style={[styles.sendBtn, sending && { opacity: 0.6 }]}
              onPress={onSend}
              disabled={sending}
            >
              <Text style={styles.sendBtnText}>
                {sending ? 'Sending…' : 'Send Balance'}
              </Text>
            </Pressable>
          </View>

          <PartnerWalletCreditHistory
            credits={credits}
            orderIdLabel={ownerType === 'restaurant' ? 'Order ID' : 'Delivery ID'}
            emptyText="No credits yet."
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
  content: { padding: 16, paddingBottom: 48 },
  ownerId: { color: '#8A829E', fontSize: 12, marginBottom: 12, fontWeight: '600' },
  empty: { color: '#8A829E', padding: 20 },
  sendCard: {
    backgroundColor: '#151022',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.22)',
    gap: 6,
  },
  sendTitle: { color: '#F5F3FF', fontWeight: '800', fontSize: 17 },
  sendHelp: { color: '#8A829E', marginBottom: 8, lineHeight: 18 },
  label: { color: '#C4B5FD', fontWeight: '600', marginTop: 8 },
  sendBtn: {
    marginTop: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
