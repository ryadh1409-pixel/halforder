import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import { db } from '@/services/firebase';
import { adminTransferEarningsWallet } from '@/services/earningsWallet';
import { useAuth } from '@/services/AuthContext';
import type { UserRole } from '@/services/userService';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { useRequireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs } from 'firebase/firestore';
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

type RecipientType = 'restaurant' | 'driver';

type RecipientOption = {
  id: string;
  name: string;
  /** Restaurant address or driver email — display only. */
  detail: string;
};

const ADMIN_ROLES: UserRole[] = ['admin'];

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function restaurantAddressFromDoc(data: Record<string, unknown>): string {
  const location = nestedRecord(data.location);
  const deliveryLocation = nestedRecord(data.deliveryLocation);
  return (
    asTrimmedString(data.address) ||
    asTrimmedString(data.formattedAddress) ||
    asTrimmedString(location?.address) ||
    asTrimmedString(location?.formattedAddress) ||
    asTrimmedString(deliveryLocation?.address) ||
    asTrimmedString(deliveryLocation?.formattedAddress) ||
    asTrimmedString(data.streetAddress) ||
    asTrimmedString(data.city) ||
    ''
  );
}

function restaurantNameFromDoc(data: Record<string, unknown>): string {
  return (
    asTrimmedString(data.name) ||
    asTrimmedString(data.restaurantName) ||
    asTrimmedString(data.businessName) ||
    asTrimmedString(data.title) ||
    asTrimmedString(nestedRecord(data.profile)?.name) ||
    // Never use the UID as the primary display label.
    'Restaurant'
  );
}

function driverNameFromDoc(data: Record<string, unknown>): string {
  const first = asTrimmedString(data.firstName);
  const last = asTrimmedString(data.lastName);
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return (
    asTrimmedString(data.displayName) ||
    asTrimmedString(data.name) ||
    asTrimmedString(data.fullName) ||
    combined ||
    'Driver'
  );
}

function driverEmailFromDoc(data: Record<string, unknown>): string {
  return (
    asTrimmedString(data.email) ||
    asTrimmedString(data.emailAddress) ||
    asTrimmedString(data.contactEmail) ||
    ''
  );
}

async function loadRestaurantOptions(): Promise<RecipientOption[]> {
  const snap = await getDocs(collection(db, 'restaurants'));
  const rows = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: restaurantNameFromDoc(data),
      detail: restaurantAddressFromDoc(data),
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

async function loadDriverOptions(): Promise<RecipientOption[]> {
  const snap = await getDocs(collection(db, 'drivers'));
  const rows = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: driverNameFromDoc(data),
      detail: driverEmailFromDoc(data),
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export default function AdminWalletTransferScreen() {
  const { authorized, loading: roleLoading } = useRequireRole(ADMIN_ROLES);
  const { user } = useAuth();
  const [recipientType, setRecipientType] = useState<RecipientType>('restaurant');
  /** UID used by transfer logic — unchanged. */
  const [recipientId, setRecipientId] = useState('');
  /** Display-only snapshot so the selected name stays visible after close. */
  const [selectedDisplay, setSelectedDisplay] = useState<RecipientOption | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [restaurants, setRestaurants] = useState<RecipientOption[]>([]);
  const [drivers, setDrivers] = useState<RecipientOption[]>([]);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    if (!authorized) return undefined;
    let cancelled = false;
    setListLoading(true);
    void (async () => {
      try {
        const [restaurantRows, driverRows] = await Promise.all([
          loadRestaurantOptions(),
          loadDriverOptions(),
        ]);
        if (cancelled) return;
        setRestaurants(restaurantRows);
        setDrivers(driverRows);
      } catch (err) {
        if (!cancelled) {
          showError(getUserFriendlyError(err));
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  const options = recipientType === 'restaurant' ? restaurants : drivers;

  const selectedRecipient = useMemo(() => {
    if (selectedDisplay && selectedDisplay.id === recipientId) {
      return selectedDisplay;
    }
    return options.find((row) => row.id === recipientId) ?? selectedDisplay;
  }, [options, recipientId, selectedDisplay]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (row) =>
        row.name.toLowerCase().includes(q) || row.id.toLowerCase().includes(q),
    );
  }, [options, searchQuery]);

  const onSelectRecipientType = (next: RecipientType) => {
    setRecipientType(next);
    setRecipientId('');
    setSelectedDisplay(null);
    setSearchQuery('');
  };

  const openPicker = () => {
    setSearchQuery('');
    setPickerOpen(true);
  };

  const onPickRecipient = (row: RecipientOption) => {
    // Transfer logic still uses the Firestore document UID only.
    setRecipientId(row.id);
    setSelectedDisplay(row);
    setPickerOpen(false);
    setSearchQuery('');
  };

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

  const recipientLabel =
    recipientType === 'restaurant' ? 'Restaurant' : 'Driver';

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
            onPress={() => onSelectRecipientType('restaurant')}
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
            onPress={() => onSelectRecipientType('driver')}
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

        <Text style={styles.label}>{recipientLabel}</Text>
        <Pressable style={styles.selectBtn} onPress={openPicker}>
          <View style={styles.selectCopy}>
            {selectedRecipient ? (
              <>
                <Text style={styles.selectTitle} numberOfLines={2}>
                  {selectedRecipient.name}
                </Text>
                <Text style={styles.selectMeta} numberOfLines={1}>
                  {recipientType === 'restaurant' ? 'Restaurant ID' : 'Driver ID'}:{' '}
                  {selectedRecipient.id}
                </Text>
                {selectedRecipient.detail ? (
                  <Text style={styles.selectDetail} numberOfLines={2}>
                    {recipientType === 'restaurant' ? 'Address' : 'Email'}:{' '}
                    {selectedRecipient.detail}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[styles.selectTitle, styles.selectPlaceholder]} numberOfLines={1}>
                  {`Select ${recipientLabel.toLowerCase()}`}
                </Text>
                <Text style={styles.selectMeta} numberOfLines={1}>
                  Search by name or ID
                </Text>
              </>
            )}
          </View>
          <Ionicons name="chevron-down" size={18} color="#8A829E" />
        </Pressable>

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

      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <SafeAreaView style={styles.pickerScreen} edges={['top', 'bottom']}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select {recipientLabel}</Text>
            <Pressable
              onPress={() => setPickerOpen(false)}
              hitSlop={12}
              style={styles.pickerClose}
            >
              <Ionicons name="close" size={22} color="#F5F3FF" />
            </Pressable>
          </View>
          <View style={styles.pickerSearch}>
            <AppTextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={`Search ${recipientLabel.toLowerCase()} name or ID`}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {listLoading ? (
            <ActivityIndicator
              size="large"
              color={COLORS.primary}
              style={{ marginTop: 24 }}
            />
          ) : (
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.pickerList}
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>
                  No {recipientLabel.toLowerCase()}s found.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.pickerRow,
                    item.id === recipientId && styles.pickerRowActive,
                  ]}
                  onPress={() => onPickRecipient(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.pickerId} numberOfLines={1}>
                      {recipientType === 'restaurant' ? 'Restaurant ID' : 'Driver ID'}:{' '}
                      {item.id}
                    </Text>
                    {item.detail ? (
                      <Text style={styles.pickerDetail} numberOfLines={2}>
                        {recipientType === 'restaurant' ? 'Address' : 'Email'}: {item.detail}
                      </Text>
                    ) : null}
                  </View>
                  {item.id === recipientId ? (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  ) : null}
                </Pressable>
              )}
            />
          )}
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
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#151022',
  },
  selectCopy: { flex: 1, gap: 3 },
  selectTitle: { color: '#F5F3FF', fontWeight: '800', fontSize: 17 },
  selectPlaceholder: { color: '#8A829E', fontWeight: '600', fontSize: 15 },
  selectMeta: { color: '#8A829E', fontSize: 12 },
  selectDetail: { color: '#B7BDC9', fontSize: 12, lineHeight: 16 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  pickerScreen: { flex: 1, backgroundColor: COLORS.background },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerTitle: { color: '#F5F3FF', fontSize: 18, fontWeight: '800' },
  pickerClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSearch: { paddingHorizontal: 16, paddingBottom: 8 },
  pickerList: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  pickerEmpty: { color: '#8A829E', textAlign: 'center', marginTop: 24 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#151022',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.18)',
  },
  pickerRowActive: { borderColor: COLORS.primary },
  pickerName: { color: '#F5F3FF', fontWeight: '800', fontSize: 17 },
  pickerId: { color: '#8A829E', fontSize: 12, marginTop: 3 },
  pickerDetail: { color: '#B7BDC9', fontSize: 12, marginTop: 3, lineHeight: 16 },
});
