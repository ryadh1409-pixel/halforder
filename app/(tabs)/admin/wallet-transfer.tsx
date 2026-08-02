import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import { adminTransferEarningsWallet } from '@/services/earningsWallet';
import { useAuth } from '@/services/AuthContext';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RecipientType = 'restaurant' | 'driver';

export default function AdminWalletTransferScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const { user } = useAuth();
  const [recipientType, setRecipientType] = useState<RecipientType>('restaurant');
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const onTransfer = async () => {
    if (!user?.uid) return;
    const n = Number.parseFloat(amount.trim());
    if (!Number.isFinite(n) || n <= 0) {
      showError('Enter a valid amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const result = await adminTransferEarningsWallet({
        recipientType,
        recipientId,
        amount: n,
        reason,
        adminUid: user.uid,
      });
      showSuccess(`Transfer complete. Ref ${result.referenceId}`);
      setAmount('');
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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title="Wallet Transfer" fallbackRoute={adminRoutes.wallet} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.help}>
          Transfer funds from the Admin wallet to a Restaurant or Driver wallet.
          Both sides receive immutable ledger entries.
        </Text>

        <Text style={styles.label}>Recipient type</Text>
        <View style={styles.typeRow}>
          <Pressable
            style={[
              styles.typeBtn,
              recipientType === 'restaurant' && styles.typeBtnActive,
            ]}
            onPress={() => setRecipientType('restaurant')}
          >
            <Text
              style={[
                styles.typeText,
                recipientType === 'restaurant' && styles.typeTextActive,
              ]}
            >
              Restaurant
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.typeBtn,
              recipientType === 'driver' && styles.typeBtnActive,
            ]}
            onPress={() => setRecipientType('driver')}
          >
            <Text
              style={[
                styles.typeText,
                recipientType === 'driver' && styles.typeTextActive,
              ]}
            >
              Driver
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>
          {recipientType === 'restaurant' ? 'Restaurant ID' : 'Driver ID'}
        </Text>
        <AppTextInput
          value={recipientId}
          onChangeText={setRecipientId}
          placeholder={
            recipientType === 'restaurant' ? 'restaurantId / owner uid' : 'driver uid'
          }
          autoCapitalize="none"
        />

        <Text style={styles.label}>Amount ($)</Text>
        <AppTextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />

        <Text style={styles.label}>Reason</Text>
        <AppTextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Reason for transfer"
        />

        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={onTransfer}
          disabled={saving}
        >
          <Text style={styles.saveText}>{saving ? 'Transferring…' : 'Send Transfer'}</Text>
        </Pressable>
      </ScrollView>
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
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  help: { color: '#8A829E', marginBottom: 8, lineHeight: 20 },
  label: { color: '#C4B5FD', fontWeight: '600', marginTop: 8 },
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
  saveBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
