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
  adminSetCustomerWalletBalance,
  getCustomerWalletProfile,
  subscribeCustomerBalanceLedger,
  subscribeHalfOrderBalance,
  type CustomerBalanceLedgerEntry,
} from '@/services/halfOrderBalance';
import type { UserRole } from '@/services/userService';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { useRequireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { confirmWalletBalanceChange } from '@/lib/confirmWalletBalanceChange';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ADMIN_ROLES: UserRole[] = ['admin'];

export default function AdminCustomerWalletDetailScreen() {
  const { authorized, loading: roleLoading } = useRequireRole(ADMIN_ROLES);
  const { user } = useAuth();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId : '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<unknown>(null);
  const [entries, setEntries] = useState<CustomerBalanceLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [newBalance, setNewBalance] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authorized || !userId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const profile = await getCustomerWalletProfile(userId);
        if (cancelled || !profile) return;
        setName(profile.name);
        setEmail(profile.email);
        setBalance(profile.currentBalance);
        setUpdatedAt(profile.updatedAt);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const unsubBal = subscribeHalfOrderBalance(userId, (b) => {
      setBalance(b);
      setLoading(false);
    });
    const unsubLedger = subscribeCustomerBalanceLedger(userId, setEntries);
    return () => {
      cancelled = true;
      unsubBal();
      unsubLedger();
    };
  }, [authorized, userId]);

  const totals = useMemo(() => {
    let credits = 0;
    let debits = 0;
    for (const e of entries) {
      if (e.delta > 0) credits += e.delta;
      else if (e.delta < 0) debits += Math.abs(e.delta);
    }
    return {
      credits: Math.round(credits * 100) / 100,
      debits: Math.round(debits * 100) / 100,
    };
  }, [entries]);

  const adjustments = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.type === 'admin_balance_adjustment' ||
          e.type === 'admin_manual_customer_credit' ||
          e.type === 'admin_manual_customer_debit' ||
          e.adminUid != null,
      ),
    [entries],
  );

  const closeEdit = () => {
    if (saving) return;
    setEditOpen(false);
    setNewBalance('');
    setReason('');
  };

  const openEdit = () => {
    setNewBalance(balance.toFixed(2));
    setReason('');
    setEditOpen(true);
  };

  const onSaveEdit = async () => {
    if (saving || !userId) return;
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

    const confirmed = await confirmWalletBalanceChange(balance, parsed);
    if (!confirmed) return;

    setSaving(true);
    try {
      const result = await adminSetCustomerWalletBalance({
        customerUid: userId,
        newBalance: parsed,
        reason: reasonTrim,
        adminUid,
      });
      showSuccess(`Balance updated. Ref ${result.referenceId}`);
      setEditOpen(false);
      setNewBalance('');
      setReason('');
      setUpdatedAt(new Date());
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

  if (!userId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AdminHeader
          title="Customer Wallet"
          fallbackRoute={adminRoutes.walletManagement}
        />
        <Text style={styles.empty}>Customer not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader
        title="Customer Wallet"
        fallbackRoute={adminRoutes.walletManagement}
      />
      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 24 }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.name}>{name || 'Customer'}</Text>
          <Text style={styles.meta}>User ID: {userId}</Text>
          {email ? <Text style={styles.meta}>Email: {email}</Text> : null}

          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Current Balance</Text>
            <Text style={styles.heroValue}>{formatWalletMoney(balance)}</Text>
            <Text style={styles.heroMeta}>
              Credits: {formatWalletMoney(totals.credits)}
            </Text>
            <Text style={styles.heroMeta}>
              Debits: {formatWalletMoney(totals.debits)}
            </Text>
            <Text style={styles.heroMeta}>
              Last updated: {formatWalletLocalDate(updatedAt)}{' '}
              {formatWalletLocalTime(updatedAt)}
            </Text>
          </View>

          <Pressable style={styles.adjustBtn} onPress={openEdit}>
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.adjustText}>Edit Balance</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Ledger History</Text>
          {entries.length === 0 ? (
            <Text style={styles.empty}>No ledger entries yet.</Text>
          ) : (
            entries.map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {formatWalletMoney(item.delta)} · {item.type}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.reason ?? '—'}
                </Text>
                <Text style={styles.rowMeta}>
                  Prev {formatWalletMoney(item.previousBalance)} → New{' '}
                  {formatWalletMoney(item.newBalance)}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatWalletLocalDate(item.createdAt)} ·{' '}
                  {formatWalletLocalTime(item.createdAt)}
                  {item.adminUid ? ` · Admin ${item.adminUid.slice(0, 8)}…` : ''}
                </Text>
              </View>
            ))
          )}

          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
            Adjustment History
          </Text>
          {adjustments.length === 0 ? (
            <Text style={styles.empty}>No admin adjustments yet.</Text>
          ) : (
            adjustments.map((item) => (
              <View key={`adj_${item.id}`} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {formatWalletMoney(item.delta)} · {item.type}
                </Text>
                <Text style={styles.rowMeta}>{item.reason ?? '—'}</Text>
                <Text style={styles.rowMeta}>
                  {formatWalletLocalDate(item.createdAt)} ·{' '}
                  {formatWalletLocalTime(item.createdAt)}
                </Text>
              </View>
            ))
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
            <Text style={styles.readonly}>{formatWalletMoney(balance)}</Text>

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
              placeholder="e.g. Support refund / correction"
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
  name: { color: '#F5F3FF', fontWeight: '800', fontSize: 18 },
  meta: { color: '#8A829E', fontSize: 12, marginTop: 2 },
  hero: {
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderRadius: 14,
    padding: 18,
    marginTop: 14,
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
  adjustBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 18,
  },
  adjustText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sectionTitle: {
    color: '#F5F3FF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  empty: { color: '#8A829E', paddingVertical: 8 },
  row: {
    backgroundColor: '#151022',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 2,
  },
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
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeText: { color: '#C4B5FD', fontWeight: '700' },
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
