import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  savePlatformDefaultTaxRate,
  subscribePlatformFeeSettings,
} from '@/services/platformFees';
import {
  saveRestaurantFees,
  subscribeRestaurantFeeRows,
  type RestaurantFeeRow,
} from '@/services/restaurantFees';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
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

function formatMoney(value: number | null): string {
  if (value == null) return '—';
  return `$${value.toFixed(2)}`;
}

function formatTaxPercent(value: number | null): string {
  if (value == null) return '—';
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(2)}%`;
}

function parseFeeInput(raw: string, fallback = 0): number {
  const n = Number.parseFloat(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default function AdminRestaurantFeesScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [rows, setRows] = useState<RestaurantFeeRow[]>([]);
  const [defaultTaxRate, setDefaultTaxRate] = useState(0.13);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [editing, setEditing] = useState<RestaurantFeeRow | null>(null);
  const [draftDelivery, setDraftDelivery] = useState('');
  const [draftService, setDraftService] = useState('');
  const [draftTax, setDraftTax] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingDefaultTax, setSavingDefaultTax] = useState(false);
  const [defaultTaxDraft, setDefaultTaxDraft] = useState('');

  useEffect(() => {
    if (!authorized) return undefined;
    const unsubRows = subscribeRestaurantFeeRows(
      (list) => {
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubPlatform = subscribePlatformFeeSettings((settings) => {
      setDefaultTaxRate(settings.defaultTaxRate);
      setDefaultTaxDraft(String((settings.defaultTaxRate * 100).toFixed(2)));
    });
    return () => {
      unsubRows();
      unsubPlatform();
    };
  }, [authorized]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, queryText]);

  const openEdit = (row: RestaurantFeeRow) => {
    setEditing(row);
    setDraftDelivery(row.deliveryFee != null ? String(row.deliveryFee) : '');
    setDraftService(row.serviceFee != null ? String(row.serviceFee) : '');
    const taxPct =
      row.taxRate != null
        ? row.taxRate <= 1
          ? row.taxRate * 100
          : row.taxRate
        : defaultTaxRate * 100;
    setDraftTax(String(taxPct.toFixed(2)));
  };

  const onSaveRestaurant = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await saveRestaurantFees({
        restaurantId: editing.id,
        deliveryFee: parseFeeInput(draftDelivery),
        serviceFee: parseFeeInput(draftService),
        taxRate: parseFeeInput(draftTax),
      });
      showSuccess('Restaurant fees saved.');
      setEditing(null);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const onSaveDefaultTax = async () => {
    setSavingDefaultTax(true);
    try {
      await savePlatformDefaultTaxRate(parseFeeInput(defaultTaxDraft, defaultTaxRate * 100));
      showSuccess('Platform default tax rate saved.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSavingDefaultTax(false);
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
        title="Restaurant Fees"
        subtitle="Delivery, service, and tax per restaurant"
        fallbackRoute={adminRoutes.home}
      />

      <View style={styles.searchWrap}>
        <AppTextInput
          style={styles.search}
          placeholder="Search restaurant…"
          placeholderTextColor={COLORS.textMuted}
          value={queryText}
          onChangeText={setQueryText}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.platformCard}>
        <Text style={styles.platformTitle}>Platform default tax</Text>
        <Text style={styles.platformHint}>
          Used when a restaurant has no custom tax rate ({formatTaxPercent(defaultTaxRate)})
        </Text>
        <View style={styles.platformRow}>
          <AppTextInput
            style={styles.platformInput}
            placeholder="Tax %"
            placeholderTextColor={COLORS.textMuted}
            value={defaultTaxDraft}
            onChangeText={setDefaultTaxDraft}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity
            style={styles.platformSaveBtn}
            onPress={onSaveDefaultTax}
            disabled={savingDefaultTax}
            activeOpacity={0.85}
          >
            {savingDefaultTax ? (
              <ActivityIndicator size="small" color={COLORS.onPrimary} />
            ) : (
              <Text style={styles.platformSaveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
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
            <Text style={styles.empty}>No restaurants found.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Delivery fee</Text>
                <Text style={styles.feeValue}>{formatMoney(item.deliveryFee)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Service fee</Text>
                <Text style={styles.feeValue}>{formatMoney(item.serviceFee)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Tax rate</Text>
                <Text style={styles.feeValue}>{formatTaxPercent(item.taxRate)}</Text>
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => openEdit(item)}
                activeOpacity={0.85}
              >
                <Text style={styles.editBtnText}>Edit</Text>
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
              <Text style={styles.modalTitle}>Edit fees</Text>
              <Text style={styles.modalMeta}>{editing?.name ?? ''}</Text>

              <Text style={styles.fieldLabel}>Delivery fee ($)</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={draftDelivery}
                onChangeText={setDraftDelivery}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>Service fee ($)</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={draftService}
                onChangeText={setDraftService}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
                editable={!saving}
              />

              <Text style={styles.fieldLabel}>Tax rate (%)</Text>
              <AppTextInput
                style={styles.fieldInput}
                value={draftTax}
                onChangeText={setDraftTax}
                keyboardType="decimal-pad"
                placeholder="13.00"
                placeholderTextColor={COLORS.textMuted}
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
                <Pressable
                  style={styles.saveBtn}
                  disabled={saving}
                  onPress={onSaveRestaurant}
                >
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
  platformCard: {
    ...adminCardShell,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  platformTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  platformHint: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  platformInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  platformSaveBtn: {
    height: 42,
    minWidth: 72,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  platformSaveText: {
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
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  feeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  feeValue: {
    fontSize: 15,
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
