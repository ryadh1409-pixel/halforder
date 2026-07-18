import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  deletePromoCode,
  savePromoCode,
  setPromoCodeActive,
  subscribePromoCodes,
  type PromoCodeDoc,
  type PromoDiscountType,
} from '@/services/promoCodes';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DraftVoucher = {
  id?: string;
  code: string;
  discountType: PromoDiscountType;
  discountValue: string;
  active: boolean;
  expiresInput: string;
  usageLimit: string;
  description: string;
};

const EMPTY: DraftVoucher = {
  code: '',
  discountType: 'fixed',
  discountValue: '',
  active: true,
  expiresInput: '',
  usageLimit: '',
  description: '',
};

/** Form fields sit on a light input fill — do not use COLORS.text (#fff). */
const FORM_INPUT_TEXT = '#0f172a';
const FORM_INPUT_PLACEHOLDER = '#94a3b8';
const FORM_INPUT_SELECTION = 'rgba(22, 163, 74, 0.28)';

function formatValue(v: PromoCodeDoc): string {
  return v.discountType === 'percent'
    ? `${v.discountValue}%`
    : `$${v.discountValue.toFixed(2)}`;
}

function formatExpiry(ms: number | null): string {
  if (ms == null) return 'No expiry';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return 'No expiry';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function parseExpiresInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const asDays = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asDays) && String(asDays) === trimmed) {
    return Date.now() + asDays * 24 * 60 * 60 * 1000;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return parsed;
  throw new Error('Expiry must be days (number) or ISO date (YYYY-MM-DD)');
}

function draftFrom(v: PromoCodeDoc): DraftVoucher {
  return {
    id: v.id,
    code: v.code,
    discountType: v.discountType,
    discountValue: String(v.discountValue),
    active: v.active,
    expiresInput:
      v.expiresAtMs != null
        ? new Date(v.expiresAtMs).toISOString().slice(0, 10)
        : '',
    usageLimit: v.usageLimit != null ? String(v.usageLimit) : '',
    description: v.description,
  };
}

/** Admin Voucher Management — stores in existing promoCodes collection. */
export default function AdminVouchersScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [rows, setRows] = useState<PromoCodeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<DraftVoucher>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!authorized) return undefined;
    return subscribePromoCodes(
      (list) => {
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [authorized]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [rows, queryText]);

  const onSave = async () => {
    setSaving(true);
    try {
      const discountValue = Number.parseFloat(draft.discountValue.trim());
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        throw new Error('Discount value must be > 0');
      }
      const usageRaw = draft.usageLimit.trim();
      const usageLimit = usageRaw
        ? Math.max(0, Math.floor(Number.parseInt(usageRaw, 10)))
        : null;
      if (usageRaw && !Number.isFinite(usageLimit!)) {
        throw new Error('Maximum uses must be a number');
      }
      const expiresAtMs = parseExpiresInput(draft.expiresInput);
      await savePromoCode({
        id: draft.id,
        code: draft.code,
        discountType: draft.discountType,
        discountValue,
        active: draft.active,
        expiresAtMs,
        usageLimit,
        restaurantIds: [],
        description: draft.description,
      });
      showSuccess('Voucher saved.');
      setModalOpen(false);
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
        title="Voucher Management"
        subtitle="Create and manage HalfOrder vouchers"
        fallbackRoute={adminRoutes.home}
      />

      <View style={styles.toolbar}>
        <AppTextInput
          style={styles.search}
          placeholder="Search vouchers…"
          placeholderTextColor={COLORS.textMuted}
          value={queryText}
          onChangeText={setQueryText}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => {
            setDraft(EMPTY);
            setModalOpen(true);
          }}
        >
          <Text style={styles.createBtnText}>+ Create Voucher</Text>
        </TouchableOpacity>
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
            <Text style={styles.empty}>No vouchers yet.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.code}>{item.code}</Text>
              <Text style={styles.meta}>
                {formatValue(item)} · {item.active ? 'Active' : 'Inactive'} ·{' '}
                {formatExpiry(item.expiresAtMs)}
              </Text>
              <Text style={styles.meta}>
                Uses {item.usedCount}
                {item.usageLimit != null ? ` / ${item.usageLimit}` : ' / ∞'}
              </Text>
              {item.description ? (
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View style={styles.rowActions}>
                <TouchableOpacity
                  style={styles.smallBtn}
                  onPress={() => {
                    setDraft(draftFrom(item));
                    setModalOpen(true);
                  }}
                >
                  <Text style={styles.smallBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.smallBtn}
                  disabled={busyId === item.id}
                  onPress={() => {
                    setBusyId(item.id);
                    void setPromoCodeActive(item.id, !item.active)
                      .then(() =>
                        showSuccess(
                          item.active ? 'Voucher deactivated.' : 'Voucher activated.',
                        ),
                      )
                      .catch((e) => showError(getUserFriendlyError(e)))
                      .finally(() => setBusyId(null));
                  }}
                >
                  <Text style={styles.smallBtnText}>
                    {item.active ? 'Deactivate' : 'Activate'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, styles.deleteBtn]}
                  disabled={busyId === item.id}
                  onPress={() =>
                    Alert.alert('Delete voucher', `Delete ${item.code}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          setBusyId(item.id);
                          void deletePromoCode(item.id)
                            .then(() => showSuccess('Voucher deleted.'))
                            .catch((e) => showError(getUserFriendlyError(e)))
                            .finally(() => setBusyId(null));
                        },
                      },
                    ])
                  }
                >
                  <Text style={[styles.smallBtnText, styles.deleteText]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modalOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {draft.id ? 'Edit voucher' : 'Create voucher'}
              </Text>

              <Text style={styles.label}>Voucher code</Text>
              <AppTextInput
                style={styles.input}
                value={draft.code}
                onChangeText={(code) => setDraft((d) => ({ ...d, code }))}
                autoCapitalize="characters"
                placeholderTextColor={FORM_INPUT_PLACEHOLDER}
                cursorColor={COLORS.primary}
                selectionColor={FORM_INPUT_SELECTION}
                editable={!saving}
              />

              <Text style={styles.label}>Discount type</Text>
              <View style={styles.typeRow}>
                {([
                  { value: 'fixed' as const, label: 'Fixed Amount' },
                  { value: 'percent' as const, label: 'Percentage' },
                ]).map((opt) => {
                  const selected = draft.discountType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.typeChip, selected && styles.typeChipOn]}
                      onPress={() =>
                        setDraft((d) => ({ ...d, discountType: opt.value }))
                      }
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          selected && styles.typeChipTextOn,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Discount value</Text>
              <AppTextInput
                style={styles.input}
                value={draft.discountValue}
                onChangeText={(discountValue) =>
                  setDraft((d) => ({ ...d, discountValue }))
                }
                keyboardType="decimal-pad"
                placeholderTextColor={FORM_INPUT_PLACEHOLDER}
                cursorColor={COLORS.primary}
                selectionColor={FORM_INPUT_SELECTION}
                editable={!saving}
              />

              <Text style={styles.label}>Maximum uses</Text>
              <AppTextInput
                style={styles.input}
                value={draft.usageLimit}
                onChangeText={(usageLimit) =>
                  setDraft((d) => ({ ...d, usageLimit }))
                }
                placeholder="Leave blank for unlimited"
                placeholderTextColor={FORM_INPUT_PLACEHOLDER}
                cursorColor={COLORS.primary}
                selectionColor={FORM_INPUT_SELECTION}
                keyboardType="number-pad"
                editable={!saving}
              />

              <Text style={styles.label}>Expiration date</Text>
              <AppTextInput
                style={styles.input}
                value={draft.expiresInput}
                onChangeText={(expiresInput) =>
                  setDraft((d) => ({ ...d, expiresInput }))
                }
                placeholder="YYYY-MM-DD or days from now"
                placeholderTextColor={FORM_INPUT_PLACEHOLDER}
                cursorColor={COLORS.primary}
                selectionColor={FORM_INPUT_SELECTION}
                editable={!saving}
              />

              <Text style={styles.label}>Description (optional)</Text>
              <AppTextInput
                style={styles.input}
                value={draft.description}
                onChangeText={(description) =>
                  setDraft((d) => ({ ...d, description }))
                }
                placeholderTextColor={FORM_INPUT_PLACEHOLDER}
                cursorColor={COLORS.primary}
                selectionColor={FORM_INPUT_SELECTION}
                editable={!saving}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Active</Text>
                <Switch
                  value={draft.active}
                  onValueChange={(active) => setDraft((d) => ({ ...d, active }))}
                  disabled={saving}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => !saving && setModalOpen(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={() => void onSave()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  search: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: '#fff',
  },
  createBtn: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  list: { padding: 16, paddingBottom: 40, gap: 12 },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  card: { ...adminCardShell, padding: 14 },
  code: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  meta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  desc: { marginTop: 8, fontSize: 14, color: COLORS.textMuted },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  deleteBtn: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  deleteText: { color: '#dc2626' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: FORM_INPUT_TEXT,
    backgroundColor: '#f8fafc',
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  typeChipOn: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(22,163,74,0.1)',
  },
  typeChipText: { fontWeight: '700', color: COLORS.textMuted },
  typeChipTextOn: { color: COLORS.primary },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },
  switchLabel: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: COLORS.textMuted },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveText: { fontWeight: '800', color: '#fff' },
});
