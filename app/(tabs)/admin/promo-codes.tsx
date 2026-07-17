import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  deletePromoCode,
  markPromoCodeSent,
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
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DraftPromo = {
  id?: string;
  code: string;
  discountType: PromoDiscountType;
  discountValue: string;
  active: boolean;
  expiresInput: string;
  usageLimit: string;
  restaurantIds: string;
  description: string;
};

const EMPTY_DRAFT: DraftPromo = {
  code: '',
  discountType: 'fixed',
  discountValue: '',
  active: true,
  expiresInput: '',
  usageLimit: '',
  restaurantIds: '',
  description: '',
};

function formatValue(promo: PromoCodeDoc): string {
  return promo.discountType === 'percent'
    ? `${promo.discountValue}%`
    : `$${promo.discountValue.toFixed(2)}`;
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

function formatUsage(promo: PromoCodeDoc): string {
  const limit = promo.usageLimit != null ? String(promo.usageLimit) : '∞';
  return `${promo.usedCount} / ${limit}`;
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

function draftFromPromo(promo: PromoCodeDoc): DraftPromo {
  return {
    id: promo.id,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: String(promo.discountValue),
    active: promo.active,
    expiresInput:
      promo.expiresAtMs != null
        ? new Date(promo.expiresAtMs).toISOString().slice(0, 10)
        : '',
    usageLimit: promo.usageLimit != null ? String(promo.usageLimit) : '',
    restaurantIds: promo.restaurantIds.join(', '),
    description: promo.description,
  };
}

export default function AdminPromoCodesScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [rows, setRows] = useState<PromoCodeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<DraftPromo>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!authorized) return undefined;
    const unsub = subscribePromoCodes(
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
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [rows, queryText]);

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setModalOpen(true);
  };

  const openEdit = (promo: PromoCodeDoc) => {
    setDraft(draftFromPromo(promo));
    setModalOpen(true);
  };

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
        throw new Error('Usage limit must be a number');
      }
      const restaurantIds = draft.restaurantIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const expiresAtMs = parseExpiresInput(draft.expiresInput);

      await savePromoCode({
        id: draft.id,
        code: draft.code,
        discountType: draft.discountType,
        discountValue,
        active: draft.active,
        expiresAtMs,
        usageLimit,
        restaurantIds,
        description: draft.description,
      });
      showSuccess('Promo code saved.');
      setModalOpen(false);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (promo: PromoCodeDoc) => {
    setBusyId(promo.id);
    try {
      await setPromoCodeActive(promo.id, !promo.active);
      showSuccess(promo.active ? 'Promo deactivated.' : 'Promo activated.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const onSend = async (promo: PromoCodeDoc) => {
    setBusyId(promo.id);
    try {
      await markPromoCodeSent(promo.id);
      showSuccess(`Promo ${promo.code} marked as sent.`);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = (promo: PromoCodeDoc) => {
    Alert.alert(
      'Delete promo code',
      `Delete ${promo.code}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(promo.id);
            try {
              await deletePromoCode(promo.id);
              showSuccess('Promo code deleted.');
              if (draft.id === promo.id) setModalOpen(false);
            } catch (e) {
              showError(getUserFriendlyError(e));
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
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
        title="Promo Codes"
        subtitle="Create and manage discount codes"
        fallbackRoute={adminRoutes.home}
      />

      <View style={styles.searchWrap}>
        <AppTextInput
          style={styles.search}
          placeholder="Search promo code…"
          placeholderTextColor={COLORS.textMuted}
          value={queryText}
          onChangeText={setQueryText}
          autoCapitalize="characters"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <TouchableOpacity style={styles.createBtn} onPress={openCreate} activeOpacity={0.85}>
          <Text style={styles.createBtnText}>+ New</Text>
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
            <Text style={styles.empty}>No promo codes found.</Text>
          }
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.code}>{item.code}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      item.active ? styles.statusActive : styles.statusInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        item.active ? styles.statusTextActive : styles.statusTextInactive,
                      ]}
                    >
                      {item.active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {item.discountType === 'percent' ? 'Percent' : 'Fixed'} · {formatValue(item)}
                </Text>
                <Text style={styles.meta}>Expires: {formatExpiry(item.expiresAtMs)}</Text>
                <Text style={styles.meta}>Usage: {formatUsage(item)}</Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => openEdit(item)}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => onToggleActive(item)}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryBtnText}>
                      {item.active ? 'Deactivate' : 'Activate'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => onSend(item)}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryBtnText}>Send</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dangerBtn}
                    onPress={() => onDelete(item)}
                    disabled={busy}
                  >
                    <Text style={styles.dangerBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!saving) setModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {draft.id ? 'Edit promo code' : 'New promo code'}
              </Text>

              <Text style={styles.fieldLabel}>Code</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={draft.code}
                onChangeText={(code) => setDraft((d) => ({ ...d, code }))}
                autoCapitalize="characters"
                placeholder="SUMMER20"
                placeholderTextColor={COLORS.textMuted}
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>Discount type</Text>
              <View style={styles.typeRow}>
                {(['fixed', 'percent'] as PromoDiscountType[]).map((type) => {
                  const selected = draft.discountType === type;
                  return (
                    <Pressable
                      key={type}
                      style={[styles.typeChip, selected && styles.typeChipSelected]}
                      onPress={() => setDraft((d) => ({ ...d, discountType: type }))}
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          selected && styles.typeChipTextSelected,
                        ]}
                      >
                        {type === 'fixed' ? 'Fixed ($)' : 'Percent (%)'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Value</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={draft.discountValue}
                onChangeText={(discountValue) =>
                  setDraft((d) => ({ ...d, discountValue }))
                }
                keyboardType="decimal-pad"
                placeholder={draft.discountType === 'percent' ? '10' : '5.00'}
                placeholderTextColor={COLORS.textMuted}
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>Active</Text>
              <View style={styles.typeRow}>
                {[true, false].map((active) => {
                  const selected = draft.active === active;
                  return (
                    <Pressable
                      key={String(active)}
                      style={[styles.typeChip, selected && styles.typeChipSelected]}
                      onPress={() => setDraft((d) => ({ ...d, active }))}
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          selected && styles.typeChipTextSelected,
                        ]}
                      >
                        {active ? 'Active' : 'Inactive'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Expires (optional)</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={draft.expiresInput}
                onChangeText={(expiresInput) =>
                  setDraft((d) => ({ ...d, expiresInput }))
                }
                placeholder="YYYY-MM-DD or days from now"
                placeholderTextColor={COLORS.textMuted}
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>Usage limit (optional)</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={draft.usageLimit}
                onChangeText={(usageLimit) => setDraft((d) => ({ ...d, usageLimit }))}
                keyboardType="number-pad"
                placeholder="Unlimited if empty"
                placeholderTextColor={COLORS.textMuted}
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>Restaurant IDs (optional)</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={draft.restaurantIds}
                onChangeText={(restaurantIds) =>
                  setDraft((d) => ({ ...d, restaurantIds }))
                }
                placeholder="id1, id2"
                placeholderTextColor={COLORS.textMuted}
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <AppTextInput
                style={[styles.fieldInput, styles.multiline]}
                value={draft.description}
                onChangeText={(description) =>
                  setDraft((d) => ({ ...d, description }))
                }
                placeholder="Internal note"
                placeholderTextColor={COLORS.textMuted}
                multiline
                editable={!saving}
              />

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  disabled={saving}
                  onPress={() => setModalOpen(false)}
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  search: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  createBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    color: COLORS.onPrimary,
    fontWeight: '800',
    fontSize: 15,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  code: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusActive: { backgroundColor: COLORS.successBg },
  statusInactive: { backgroundColor: COLORS.dangerBg },
  statusText: { fontSize: 12, fontWeight: '800' },
  statusTextActive: { color: COLORS.successText },
  statusTextInactive: { color: COLORS.error },
  meta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  description: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  secondaryBtn: {
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  dangerBtn: {
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.error,
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
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  fieldLabel: {
    marginTop: 14,
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
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  typeChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.successBg,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  typeChipTextSelected: { color: COLORS.primary },
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
