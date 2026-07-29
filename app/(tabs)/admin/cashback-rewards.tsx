import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  getAdminCashbackRewards,
  saveAdminCashbackRewards,
} from '@/services/cashbackRewards';
import {
  CASHBACK_REWARDS_DEFAULTS,
  type CashbackOrderType,
  type CashbackRewardsAdminDashboard,
  type CashbackRewardsSettings,
} from '@/types/cashbackRewards';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatMoney(n: number): string {
  return `$${Math.max(0, n).toFixed(2)} CAD`;
}

function formatDateInput(ms: number | null): string {
  if (ms == null) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function parseDateInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function parseRestaurantIds(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

type Draft = {
  enabled: boolean;
  visibleInUserApp: boolean;
  paused: boolean;
  cashbackPercentage: string;
  maxCashbackPerOrderCad: string;
  minimumOrderValueCad: string;
  eligibleRestaurantIds: string;
  eligibleOrderTypes: CashbackOrderType[];
  campaignBudgetCad: string;
  startInput: string;
  endInput: string;
  expirationDays: string;
};

function settingsToDraft(s: CashbackRewardsSettings): Draft {
  return {
    enabled: s.enabled,
    visibleInUserApp: s.visibleInUserApp,
    paused: s.paused,
    cashbackPercentage: String(s.cashbackPercentage),
    maxCashbackPerOrderCad: String(s.maxCashbackPerOrderCad),
    minimumOrderValueCad: String(s.minimumOrderValueCad),
    eligibleRestaurantIds: (s.eligibleRestaurantIds ?? []).join(', '),
    eligibleOrderTypes: [...(s.eligibleOrderTypes ?? ['delivery', 'pickup'])],
    campaignBudgetCad: String(s.campaignBudgetCad),
    startInput: formatDateInput(s.startAtMs),
    endInput: formatDateInput(s.endAtMs),
    expirationDays:
      s.expirationDays == null ? '' : String(s.expirationDays),
  };
}

function toggleOrderType(
  current: CashbackOrderType[],
  type: CashbackOrderType,
): CashbackOrderType[] {
  if (current.includes(type)) {
    return current.filter((t) => t !== type);
  }
  return [...current, type];
}

export default function AdminCashbackRewardsScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [dashboard, setDashboard] =
    useState<CashbackRewardsAdminDashboard | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAdminCashbackRewards();
      setDashboard(next);
      setDraft(settingsToDraft(next.settings));
    } catch (e) {
      showError(getUserFriendlyError(e));
      setDashboard(null);
      setDraft(settingsToDraft(CASHBACK_REWARDS_DEFAULTS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void reload();
  }, [authorized, reload]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const cashbackPercentage = Number(draft.cashbackPercentage);
      const maxCashbackPerOrderCad = Number(draft.maxCashbackPerOrderCad);
      const minimumOrderValueCad = Number(draft.minimumOrderValueCad);
      const campaignBudgetCad = Number(draft.campaignBudgetCad);
      const expirationRaw = draft.expirationDays.trim();
      const expirationDays =
        expirationRaw === '' ? null : Number(expirationRaw);

      if (!(cashbackPercentage >= 0 && cashbackPercentage <= 100)) {
        throw new Error('Cashback percentage must be 0–100');
      }
      if (!(maxCashbackPerOrderCad >= 0)) {
        throw new Error('Invalid max cashback per order');
      }
      if (!(minimumOrderValueCad >= 0)) {
        throw new Error('Invalid minimum order value');
      }
      if (!(campaignBudgetCad >= 0)) {
        throw new Error('Invalid campaign budget');
      }
      if (expirationDays != null && (!(expirationDays >= 1) || !Number.isFinite(expirationDays))) {
        throw new Error('Expiration days must be empty or at least 1');
      }
      if (draft.eligibleOrderTypes.length === 0) {
        throw new Error('Select at least one eligible order type');
      }

      await saveAdminCashbackRewards({
        enabled: draft.enabled,
        visibleInUserApp: draft.visibleInUserApp,
        paused: draft.paused,
        cashbackPercentage,
        maxCashbackPerOrderCad,
        minimumOrderValueCad,
        eligibleRestaurantIds: parseRestaurantIds(draft.eligibleRestaurantIds),
        eligibleOrderTypes: draft.eligibleOrderTypes,
        campaignBudgetCad,
        startAtMs: parseDateInput(draft.startInput),
        endAtMs: parseDateInput(draft.endInput),
        expirationDays,
      });
      showSuccess('Cashback rewards saved');
      await reload();
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const endImmediately = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      enabled: false,
      paused: true,
      visibleInUserApp: false,
      endInput: formatDateInput(Date.now()),
    });
  };

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (loading || !draft) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <AdminHeader
          title="Cashback Rewards"
          subtitle="HalfOrder Cash · earn & redeem"
          fallbackRoute={adminRoutes.home}
        />
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  const analytics = dashboard?.analytics;
  const topRestaurants = dashboard?.topRestaurants ?? [];
  const cashbackByDate = dashboard?.cashbackByDate ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AdminHeader
        title="Cashback Rewards"
        subtitle="HalfOrder Cash · earn & redeem"
        fallbackRoute={adminRoutes.home}
      />

      <FlatList
        data={cashbackByDate}
        keyExtractor={(item, index) => `${item.date}-${index}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.section}>Analytics</Text>
            <View style={styles.dashGrid}>
              <DashCell
                label="Total issued"
                value={formatMoney(analytics?.totalIssuedCad ?? 0)}
              />
              <DashCell
                label="Redeemed"
                value={formatMoney(analytics?.totalRedeemedCad ?? 0)}
              />
              <DashCell
                label="Active users"
                value={String(analytics?.activeUsers ?? 0)}
              />
              <DashCell
                label="Redemption rate"
                value={`${Math.round((analytics?.redemptionRate ?? 0) * 1000) / 10}%`}
              />
              <DashCell
                label="Budget remaining"
                value={formatMoney(analytics?.budgetRemainingCad ?? 0)}
              />
            </View>

            <Text style={[styles.section, { marginTop: 18 }]}>Controls</Text>
            <View style={styles.formCard}>
              <RowSwitch
                label="Enable campaign"
                value={draft.enabled}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, enabled: v } : d))
                }
              />
              <RowSwitch
                label="Show in User App"
                value={draft.visibleInUserApp}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, visibleInUserApp: v } : d))
                }
              />
              <RowSwitch
                label="Pause campaign"
                value={draft.paused}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, paused: v } : d))
                }
              />

              <Text style={styles.label}>Cashback percentage</Text>
              <AppTextInput
                value={draft.cashbackPercentage}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, cashbackPercentage: t } : d))
                }
                keyboardType="decimal-pad"
                placeholder="3"
              />
              <Text style={styles.label}>Max cashback / order (CAD)</Text>
              <AppTextInput
                value={draft.maxCashbackPerOrderCad}
                onChangeText={(t) =>
                  setDraft((d) =>
                    d ? { ...d, maxCashbackPerOrderCad: t } : d,
                  )
                }
                keyboardType="decimal-pad"
                placeholder="100"
              />
              <Text style={styles.label}>Minimum order value (CAD)</Text>
              <AppTextInput
                value={draft.minimumOrderValueCad}
                onChangeText={(t) =>
                  setDraft((d) =>
                    d ? { ...d, minimumOrderValueCad: t } : d,
                  )
                }
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <Text style={styles.label}>
                Eligible restaurant IDs (comma-separated, empty = all)
              </Text>
              <AppTextInput
                value={draft.eligibleRestaurantIds}
                onChangeText={(t) =>
                  setDraft((d) =>
                    d ? { ...d, eligibleRestaurantIds: t } : d,
                  )
                }
                placeholder="Optional"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Eligible order types</Text>
              <View style={styles.typeRow}>
                <TypeChip
                  label="Delivery"
                  active={draft.eligibleOrderTypes.includes('delivery')}
                  onPress={() =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            eligibleOrderTypes: toggleOrderType(
                              d.eligibleOrderTypes,
                              'delivery',
                            ),
                          }
                        : d,
                    )
                  }
                />
                <TypeChip
                  label="Pickup"
                  active={draft.eligibleOrderTypes.includes('pickup')}
                  onPress={() =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            eligibleOrderTypes: toggleOrderType(
                              d.eligibleOrderTypes,
                              'pickup',
                            ),
                          }
                        : d,
                    )
                  }
                />
              </View>

              <Text style={styles.label}>Campaign budget (CAD)</Text>
              <AppTextInput
                value={draft.campaignBudgetCad}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, campaignBudgetCad: t } : d))
                }
                keyboardType="decimal-pad"
                placeholder="10000"
              />
              <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
              <AppTextInput
                value={draft.startInput}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, startInput: t } : d))
                }
                placeholder="Optional"
              />
              <Text style={styles.label}>End date (YYYY-MM-DD)</Text>
              <AppTextInput
                value={draft.endInput}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, endInput: t } : d))
                }
                placeholder="Optional"
              />
              <Text style={styles.label}>
                Expiration days (optional, blank = never)
              </Text>
              <AppTextInput
                value={draft.expirationDays}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, expirationDays: t } : d))
                }
                keyboardType="number-pad"
                placeholder="Optional"
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
                onPress={() => void save()}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveTxt}>Save settings</Text>
                )}
              </TouchableOpacity>

              <View style={styles.quickRow}>
                <Pressable
                  style={styles.quickBtn}
                  onPress={() =>
                    setDraft((d) =>
                      d ? { ...d, paused: true, enabled: true } : d,
                    )
                  }
                >
                  <Text style={styles.quickTxt}>Pause</Text>
                </Pressable>
                <Pressable
                  style={styles.quickBtn}
                  onPress={() =>
                    setDraft((d) =>
                      d ? { ...d, paused: false, enabled: true } : d,
                    )
                  }
                >
                  <Text style={styles.quickTxt}>Resume</Text>
                </Pressable>
                <Pressable
                  style={[styles.quickBtn, styles.endBtn]}
                  onPress={endImmediately}
                >
                  <Text style={styles.endTxt}>End now</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>
                Customers earn cashback when Enable is on and the campaign is
                not paused. Show in User App controls wallet history details;
                balance remains visible. Empty restaurant IDs means all
                restaurants.
              </Text>
            </View>

            <Text style={[styles.section, { marginTop: 18 }]}>
              Top restaurants
            </Text>
            {topRestaurants.length === 0 ? (
              <Text style={styles.empty}>No cashback issued yet.</Text>
            ) : (
              <View style={styles.topList}>
                {topRestaurants.map((row) => (
                  <View key={row.restaurantId} style={styles.topCard}>
                    <Text style={styles.topName} numberOfLines={1}>
                      {row.restaurantName || row.restaurantId}
                    </Text>
                    <Text style={styles.topMeta}>
                      {formatMoney(row.cashbackCad)} · {row.orders} orders
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.section, { marginTop: 18 }]}>
              Cashback by date
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No daily cashback data yet.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.dateCard}>
            <Text style={styles.dateLabel}>{item.date}</Text>
            <Text style={styles.dateMeta}>
              Issued {formatMoney(item.issuedCad)} · Pending{' '}
              {formatMoney(item.pendingCad)} · Redeemed{' '}
              {formatMoney(item.redeemedCad)}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function DashCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dashCell}>
      <Text style={styles.dashLabel}>{label}</Text>
      <Text style={styles.dashValue}>{value}</Text>
    </View>
  );
}

function RowSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function TypeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.typeChip, active && styles.typeChipActive]}
      onPress={onPress}
    >
      <Text style={[styles.typeChipTxt, active && styles.typeChipTxtActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 16, paddingBottom: 48 },
  headerBlock: { marginBottom: 8 },
  section: {
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  dashGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dashCell: {
    ...adminCardShell,
    width: '48%',
    flexGrow: 1,
    padding: 12,
    minWidth: 140,
  },
  dashLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  dashValue: {
    marginTop: 6,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  formCard: {
    ...adminCardShell,
    gap: 8,
  },
  label: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchLabel: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    paddingRight: 12,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardElevated,
  },
  typeChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  typeChipTxt: {
    color: COLORS.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  typeChipTxtActive: { color: COLORS.text },
  saveBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickTxt: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  endBtn: { borderColor: 'rgba(248,113,113,0.45)' },
  endTxt: { color: '#F87171', fontWeight: '800', fontSize: 13 },
  hint: {
    marginTop: 10,
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  topList: { gap: 8 },
  topCard: {
    ...adminCardShell,
    padding: 12,
  },
  topName: { color: COLORS.text, fontWeight: '800', fontSize: 14 },
  topMeta: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  dateCard: {
    ...adminCardShell,
    marginBottom: 10,
    padding: 12,
  },
  dateLabel: { color: COLORS.text, fontWeight: '800', fontSize: 14 },
  dateMeta: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
