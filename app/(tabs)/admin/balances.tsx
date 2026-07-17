import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  adminAdjustHalfOrderBalance,
  parseHalfOrderBalance,
} from '@/services/halfOrderBalance';
import { db } from '@/services/firebase';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type BalanceRow = {
  id: string;
  name: string;
  email: string | null;
  balance: number;
};

function subscribeUsersWithBalance(
  onData: (rows: BalanceRow[]) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users'), orderBy('createdAt', 'desc')),
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          name:
            (typeof data.name === 'string' && data.name.trim()) ||
            (typeof data.displayName === 'string' && data.displayName.trim()) ||
            'Unknown user',
          email: typeof data.email === 'string' ? data.email : null,
          balance: parseHalfOrderBalance(data),
        } satisfies BalanceRow;
      });
      onData(rows);
    },
    () => onError?.(),
  );
}

function formatBalance(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function AdminBalancesScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [editing, setEditing] = useState<BalanceRow | null>(null);
  const [deltaInput, setDeltaInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authorized) return undefined;
    const unsub = subscribeUsersWithBalance(
      (list) => {
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [authorized]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false) ||
        r.id.toLowerCase().includes(q),
    );
  }, [rows, queryText]);

  const openEdit = (row: BalanceRow) => {
    setEditing(row);
    setDeltaInput('');
    setReasonInput('');
  };

  const onSave = async () => {
    if (!editing) return;
    const delta = Number.parseFloat(deltaInput.trim());
    if (!Number.isFinite(delta) || delta === 0) {
      showError('Enter a non-zero amount (+ or -).');
      return;
    }
    setSaving(true);
    try {
      const next = await adminAdjustHalfOrderBalance({
        userId: editing.id,
        delta,
        reason: reasonInput.trim() || undefined,
      });
      showSuccess(`Balance updated to ${formatBalance(next)}.`);
      setEditing(null);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Balances"
        subtitle="Half-order wallet credits"
        fallbackRoute={adminRoutes.home}
      />

      <View style={styles.searchWrap}>
        <AppTextInput
          style={styles.search}
          placeholder="Search name, email, or user id…"
          placeholderTextColor={COLORS.textMuted}
          value={queryText}
          onChangeText={setQueryText}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No users found.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {item.email ?? item.id}
              </Text>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Half-order balance</Text>
                <Text style={styles.balanceValue}>{formatBalance(item.balance)}</Text>
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => openEdit(item)}
                activeOpacity={0.85}
              >
                <Text style={styles.editBtnText}>Adjust</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal
        visible={editing != null}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!saving) setEditing(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Adjust balance</Text>
              <Text style={styles.modalMeta}>{editing?.name ?? ''}</Text>
              <Text style={styles.modalSub}>
                Current: {formatBalance(editing?.balance ?? 0)}
              </Text>

              <Text style={styles.fieldLabel}>Amount (+ / -)</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={deltaInput}
                onChangeText={setDeltaInput}
                keyboardType="decimal-pad"
                placeholder="e.g. 5.00 or -2.50"
                placeholderTextColor={COLORS.textMuted}
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>Reason (optional)</Text>
              <AppTextInput
                style={[styles.fieldInput, styles.multiline]}
                value={reasonInput}
                onChangeText={setReasonInput}
                placeholder="Support note"
                placeholderTextColor={COLORS.textMuted}
                multiline
                editable={!saving}
              />

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  disabled={saving}
                  onPress={() => setEditing(null)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveBtn} disabled={saving} onPress={onSave}>
                  {saving ? (
                    <ActivityIndicator size="small" color={COLORS.onPrimary} />
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
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
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  search: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  list: { padding: 16, paddingBottom: 40 },
  empty: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 32,
    fontSize: 15,
  },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  email: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  editBtn: {
    marginTop: 14,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    color: COLORS.onPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalMeta: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  modalSub: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  fieldLabel: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fieldInput: {
    marginTop: 6,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontWeight: '700',
    color: COLORS.textMuted,
    fontSize: 15,
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontWeight: '800',
    color: COLORS.onPrimary,
    fontSize: 15,
  },
});
