import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  formatWalletLocalDate,
  formatWalletLocalTime,
  formatWalletMoney,
} from '@/lib/earningsWalletFormat';
import { useAuth } from '@/services/AuthContext';
import {
  adminSetEarningsWalletBalance,
  subscribeEarningsLedger,
  subscribeEarningsWallet,
} from '@/services/earningsWallet';
import type { EarningsLedgerEntry, EarningsWalletDoc } from '@/types/earningsWallet';
import type { UserRole } from '@/services/userService';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { useRequireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { confirmWalletBalanceChange } from '@/lib/confirmWalletBalanceChange';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ADMIN_ROLES: UserRole[] = ['admin'];

function parseOwnerType(raw: unknown): 'restaurant' | 'driver' | null {
  if (raw === 'restaurant' || raw === 'driver') return raw;
  return null;
}

export default function AdminWalletManagementDetailScreen() {
  const { authorized, loading: roleLoading } = useRequireRole(ADMIN_ROLES);
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ ownerType?: string; ownerId?: string }>();
  const ownerType = useMemo(
    () => parseOwnerType(params.ownerType),
    [params.ownerType],
  );
  const ownerId = typeof params.ownerId === 'string' ? params.ownerId : '';

  const [wallet, setWallet] = useState<EarningsWalletDoc | null>(null);
  const [entries, setEntries] = useState<EarningsLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [newBalance, setNewBalance] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authorized || !ownerType || !ownerId) return undefined;
    const unsubW = subscribeEarningsWallet(
      ownerType,
      ownerId,
      (w) => {
        setWallet(w);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubL = subscribeEarningsLedger(ownerType, ownerId, setEntries);
    return () => {
      unsubW();
      unsubL();
    };
  }, [authorized, ownerType, ownerId]);

  const closeEdit = () => {
    if (saving) return;
    setEditOpen(false);
    setNewBalance('');
    setReason('');
  };

  const openEdit = () => {
    setNewBalance((wallet?.currentBalance ?? 0).toFixed(2));
    setReason('');
    setEditOpen(true);
  };

  const onSaveEdit = async () => {
    if (saving || !ownerType || !ownerId) return;
    const raw = String(newBalance).replace(/,/g, '').trim();
    if (!raw) {
      showError('New balance is required.');
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      showError('Enter a valid new balance of zero or greater.');
      return;
    }
    const reasonTrim = reason.trim();
    if (!reasonTrim) {
      showError('Reason is required.');
      return;
    }
    const adminUid = user?.uid?.trim() ?? '';
    if (!adminUid) {
      showError('You must be signed in as an admin.');
      return;
    }

    const previous = wallet?.currentBalance ?? 0;
    const confirmed = await confirmWalletBalanceChange(previous, parsed);
    if (!confirmed) return;

    setSaving(true);
    try {
      const result = await adminSetEarningsWalletBalance({
        ownerType,
        ownerId,
        newBalance: parsed,
        reason: reasonTrim,
        adminUid,
      });
      showSuccess(`Balance updated. Ref ${result.referenceId}`);
      setEditOpen(false);
      setNewBalance('');
      setReason('');
    } catch (err) {
      showError(getUserFriendlyError(err));
    } finally {
      setSaving(false);
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
        <AdminHeader
          title="Wallet"
          fallbackRoute={adminRoutes.walletManagement}
        />
        <Text style={styles.empty}>Wallet not found.</Text>
      </SafeAreaView>
    );
  }

  const title =
    ownerType === 'restaurant' ? 'Restaurant Wallet' : 'Driver Wallet';
  const totalEarnings = formatWalletMoney(
    wallet?.totalEarnings ||
      wallet?.lifetimeEarnings ||
      wallet?.restaurantTotalEarnings ||
      0,
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title={title} fallbackRoute={adminRoutes.walletManagement} />
      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 24 }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.ownerId} numberOfLines={1}>
            {ownerId}
          </Text>

          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Current Balance</Text>
            <Text style={styles.heroValue}>
              {formatWalletMoney(wallet?.currentBalance)}
            </Text>
            <Text style={styles.heroMeta}>Total Earnings: {totalEarnings}</Text>
            <Text style={styles.heroMeta}>
              Pending: {formatWalletMoney(wallet?.pendingBalance)}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={openEdit}>
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Edit Balance</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionSecondary]}
              onPress={() =>
                router.push(adminRoutes.walletTransfer as never)
              }
            >
              <Ionicons name="swap-horizontal" size={18} color={COLORS.primary} />
              <Text style={[styles.actionText, { color: COLORS.primary }]}>
                Transfer
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Transaction History</Text>
          {entries.length === 0 ? (
            <Text style={styles.empty}>No wallet transactions yet.</Text>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() =>
                    router.push(adminRoutes.walletTransaction(item.id) as never)
                  }
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>
                      {formatWalletMoney(item.signedAmount)} · {item.type}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {item.reason ?? item.notes ?? item.description ?? '—'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatWalletLocalDate(item.createdAt)} ·{' '}
                      {formatWalletLocalTime(item.createdAt)} · {item.status}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#8A829E" />
                </Pressable>
              )}
            />
          )}
        </ScrollView>
      )}

      <Modal
        visible={editOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEdit}
      >
        <SafeAreaView style={styles.modalScreen} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Balance</Text>
            <Pressable
              onPress={closeEdit}
              hitSlop={12}
              style={styles.modalClose}
              disabled={saving}
            >
              <Ionicons name="close" size={22} color="#F5F3FF" />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Current Balance</Text>
            <Text style={styles.readonly}>
              {formatWalletMoney(wallet?.currentBalance)}
            </Text>

            <Text style={styles.label}>New Balance ($)</Text>
            <AppTextInput
              value={newBalance}
              onChangeText={setNewBalance}
              keyboardType="decimal-pad"
              placeholder="0.00"
              editable={!saving}
            />

            <Text style={styles.label}>Reason (required)</Text>
            <AppTextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Bank transfer payout 2026-08-02"
              editable={!saving}
            />

            <Pressable
              style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
              onPress={onSaveEdit}
              disabled={saving}
            >
              <Text style={styles.confirmText}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.cancelBtn, saving && { opacity: 0.6 }]}
              onPress={closeEdit}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  content: { padding: 16, paddingBottom: 40 },
  ownerId: { color: '#8A829E', marginBottom: 10, fontSize: 12 },
  hero: {
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },
  heroLabel: { color: '#C4B5FD', fontWeight: '600' },
  heroValue: {
    color: '#F5F3FF',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
  },
  heroMeta: { color: '#8A829E', marginTop: 6, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionText: { color: '#fff', fontWeight: '700' },
  sectionTitle: {
    color: '#F5F3FF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  empty: { color: '#8A829E', padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151022',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: '#F5F3FF', fontWeight: '700' },
  rowMeta: { color: '#8A829E', fontSize: 12 },
  modalScreen: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalTitle: { color: '#F5F3FF', fontSize: 18, fontWeight: '800' },
  modalClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: { padding: 16, gap: 8, paddingBottom: 40 },
  label: { color: '#C4B5FD', fontWeight: '600', marginTop: 8 },
  readonly: {
    color: '#F5F3FF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeText: { color: '#C4B5FD', fontWeight: '700', textAlign: 'center', fontSize: 13 },
  typeTextActive: { color: '#fff' },
  confirmBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  cancelText: { color: '#C4B5FD', fontWeight: '700', fontSize: 16 },
});
