import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { PartnerHalfOrderBalanceCard } from '@/components/partnerWallet/PartnerHalfOrderBalanceCard';
import { PartnerWalletCreditHistory } from '@/components/partnerWallet/PartnerWalletCreditHistory';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import { confirmWalletBalanceChange } from '@/lib/confirmWalletBalanceChange';
import {
  adminSetPartnerWalletBalance,
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
  Modal,
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
  const [editOpen, setEditOpen] = useState(false);
  const [newBalance, setNewBalance] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

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

  const currentBalance = wallet?.currentBalance ?? 0;

  const closeEdit = () => {
    if (saving) return;
    setEditOpen(false);
    setNewBalance('');
    setReason('');
  };

  const openEdit = () => {
    setNewBalance(currentBalance.toFixed(2));
    setReason('');
    setEditOpen(true);
  };

  const onSave = async () => {
    if (saving || !user?.uid || !ownerType || !ownerId) return;
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

    const confirmed = await confirmWalletBalanceChange(currentBalance, parsed);
    if (!confirmed) return;

    setSaving(true);
    try {
      await adminSetPartnerWalletBalance({
        ownerType,
        ownerId,
        newBalance: parsed,
        reason: reasonTrim,
        adminUid: user.uid,
      });
      showSuccess('Wallet balance updated.');
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
            balance={currentBalance}
            updatedAt={wallet?.updatedAt ?? null}
          />

          <Pressable style={styles.editBtn} onPress={openEdit}>
            <Text style={styles.editBtnText}>Edit Balance</Text>
          </Pressable>

          <PartnerWalletCreditHistory
            credits={credits}
            orderIdLabel={ownerType === 'restaurant' ? 'Order ID' : 'Delivery ID'}
            emptyText="No wallet history yet."
          />
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
            <Pressable onPress={closeEdit} disabled={saving} hitSlop={12}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Current Balance</Text>
            <Text style={styles.readonly}>CA${currentBalance.toFixed(2)}</Text>

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
              placeholder="e.g. External bank payout"
              editable={!saving}
            />

            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
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
  content: { padding: 16, paddingBottom: 48 },
  ownerId: { color: '#8A829E', fontSize: 12, marginBottom: 12, fontWeight: '600' },
  empty: { color: '#8A829E', padding: 20 },
  editBtn: {
    marginTop: 4,
    marginBottom: 24,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  modalScreen: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalTitle: { color: '#F5F3FF', fontSize: 18, fontWeight: '800' },
  closeText: { color: '#C4B5FD', fontWeight: '700' },
  modalContent: { padding: 16, gap: 8, paddingBottom: 40 },
  label: { color: '#C4B5FD', fontWeight: '600', marginTop: 8 },
  readonly: { color: '#F5F3FF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
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
