import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  getAdminDriverReferralCampaign,
  saveAdminDriverReferralCampaign,
  updateDriverReferralRewardStatus,
} from '@/services/driverReferralProgram';
import {
  DRIVER_REFERRAL_CAMPAIGN_DEFAULTS,
  type DriverReferralAdminDashboard,
  type DriverReferralCampaignSettings,
  type DriverReferralHistoryRow,
  type DriverReferralRewardType,
} from '@/types/driverReferralProgram';
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

type Draft = {
  enabled: boolean;
  visibleInDriverApp: boolean;
  paused: boolean;
  rewardType: DriverReferralRewardType;
  rewardPercentage: string;
  fixedRewardCad: string;
  campaignBudgetCad: string;
  startInput: string;
  endInput: string;
  maxReferralsPerDriver: string;
  minimumOrderValueCad: string;
  requireCompletedPayment: boolean;
  requireCompletedDelivery: boolean;
};

function settingsToDraft(s: DriverReferralCampaignSettings): Draft {
  return {
    enabled: s.enabled,
    visibleInDriverApp: s.visibleInDriverApp,
    paused: s.paused,
    rewardType: s.rewardType,
    rewardPercentage: String(s.rewardPercentage),
    fixedRewardCad: String(s.fixedRewardCad),
    campaignBudgetCad: String(s.campaignBudgetCad),
    startInput: formatDateInput(s.startAtMs),
    endInput: formatDateInput(s.endAtMs),
    maxReferralsPerDriver: String(s.maxReferralsPerDriver),
    minimumOrderValueCad: String(s.minimumOrderValueCad),
    requireCompletedPayment: s.requireCompletedPayment,
    requireCompletedDelivery: s.requireCompletedDelivery,
  };
}

export default function AdminDriverReferralCampaignScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [dashboard, setDashboard] =
    useState<DriverReferralAdminDashboard | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAdminDriverReferralCampaign();
      setDashboard(next);
      setDraft(settingsToDraft(next.settings));
    } catch (e) {
      showError(getUserFriendlyError(e));
      setDashboard(null);
      setDraft(settingsToDraft(DRIVER_REFERRAL_CAMPAIGN_DEFAULTS));
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
      const rewardPercentage = Number(draft.rewardPercentage);
      const fixedRewardCad = Number(draft.fixedRewardCad);
      const campaignBudgetCad = Number(draft.campaignBudgetCad);
      const maxReferralsPerDriver = Number(draft.maxReferralsPerDriver);
      const minimumOrderValueCad = Number(draft.minimumOrderValueCad);
      if (!(rewardPercentage >= 0 && rewardPercentage <= 100)) {
        throw new Error('Reward percentage must be 0–100');
      }
      if (!(fixedRewardCad >= 0)) throw new Error('Invalid fixed reward');
      if (!(campaignBudgetCad >= 0)) throw new Error('Invalid campaign budget');
      if (!(maxReferralsPerDriver >= 1)) {
        throw new Error('Max referrals per driver must be at least 1');
      }
      if (!(minimumOrderValueCad >= 0)) {
        throw new Error('Invalid minimum order value');
      }

      await saveAdminDriverReferralCampaign({
        enabled: draft.enabled,
        visibleInDriverApp: draft.visibleInDriverApp,
        paused: draft.paused,
        rewardType: draft.rewardType,
        rewardPercentage,
        fixedRewardCad,
        campaignBudgetCad,
        startAtMs: parseDateInput(draft.startInput),
        endAtMs: parseDateInput(draft.endInput),
        maxReferralsPerDriver,
        minimumOrderValueCad,
        requireCompletedPayment: draft.requireCompletedPayment,
        requireCompletedDelivery: draft.requireCompletedDelivery,
      });
      showSuccess('Driver referral campaign saved');
      await reload();
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const endImmediately = async () => {
    if (!draft) return;
    setDraft({
      ...draft,
      enabled: false,
      paused: true,
      visibleInDriverApp: false,
      endInput: formatDateInput(Date.now()),
    });
  };

  const actOnReward = async (
    customerId: string,
    action: 'paid' | 'cancelled',
  ) => {
    setActingId(customerId);
    try {
      await updateDriverReferralRewardStatus(customerId, action);
      showSuccess(action === 'paid' ? 'Reward marked paid' : 'Reward cancelled');
      await reload();
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setActingId(null);
    }
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
          title="Driver Referral"
          subtitle="Invite customers · first-order reward"
          fallbackRoute={adminRoutes.home}
        />
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  const analytics = dashboard?.analytics;
  const rewards = dashboard?.rewards ?? [];
  const topDrivers = dashboard?.topDrivers ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AdminHeader
        title="Driver Referral"
        subtitle="Invite customers · first-order reward"
        fallbackRoute={adminRoutes.home}
      />

      <FlatList
        data={rewards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.section}>Analytics</Text>
            <View style={styles.dashGrid}>
              <DashCell
                label="Total referrals"
                value={String(analytics?.totalReferrals ?? 0)}
              />
              <DashCell
                label="New customers"
                value={String(analytics?.newCustomersAcquired ?? 0)}
              />
              <DashCell
                label="Conversion"
                value={`${Math.round((analytics?.conversionRate ?? 0) * 1000) / 10}%`}
              />
              <DashCell
                label="Rewards paid"
                value={formatMoney(analytics?.rewardsPaidCad ?? 0)}
              />
              <DashCell
                label="Pending rewards"
                value={String(analytics?.pendingRewards ?? 0)}
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
                label="Show in Driver App"
                value={draft.visibleInDriverApp}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, visibleInDriverApp: v } : d))
                }
              />
              <RowSwitch
                label="Pause campaign"
                value={draft.paused}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, paused: v } : d))
                }
              />
              <RowSwitch
                label="Require completed payment"
                value={draft.requireCompletedPayment}
                onChange={(v) =>
                  setDraft((d) =>
                    d ? { ...d, requireCompletedPayment: v } : d,
                  )
                }
              />
              <RowSwitch
                label="Require completed delivery"
                value={draft.requireCompletedDelivery}
                onChange={(v) =>
                  setDraft((d) =>
                    d ? { ...d, requireCompletedDelivery: v } : d,
                  )
                }
              />

              <Text style={styles.label}>Reward type</Text>
              <View style={styles.typeRow}>
                <TypeChip
                  label="% of delivery fee"
                  active={draft.rewardType === 'delivery_fee_percentage'}
                  onPress={() =>
                    setDraft((d) =>
                      d
                        ? { ...d, rewardType: 'delivery_fee_percentage' }
                        : d,
                    )
                  }
                />
                <TypeChip
                  label="Fixed CAD"
                  active={draft.rewardType === 'fixed_amount'}
                  onPress={() =>
                    setDraft((d) =>
                      d ? { ...d, rewardType: 'fixed_amount' } : d,
                    )
                  }
                />
              </View>

              <Text style={styles.label}>Reward percentage</Text>
              <AppTextInput
                value={draft.rewardPercentage}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, rewardPercentage: t } : d))
                }
                keyboardType="decimal-pad"
                placeholder="100"
              />
              <Text style={styles.label}>Fixed reward (CAD)</Text>
              <AppTextInput
                value={draft.fixedRewardCad}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, fixedRewardCad: t } : d))
                }
                keyboardType="decimal-pad"
                placeholder="5"
              />
              <Text style={styles.label}>Campaign budget (CAD)</Text>
              <AppTextInput
                value={draft.campaignBudgetCad}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, campaignBudgetCad: t } : d))
                }
                keyboardType="decimal-pad"
                placeholder="1000"
              />
              <Text style={styles.label}>Max referrals per driver</Text>
              <AppTextInput
                value={draft.maxReferralsPerDriver}
                onChangeText={(t) =>
                  setDraft((d) =>
                    d ? { ...d, maxReferralsPerDriver: t } : d,
                  )
                }
                keyboardType="number-pad"
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
                  onPress={() => void endImmediately()}
                >
                  <Text style={styles.endTxt}>End now</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>
                Drivers only see this program when Enable and Show in Driver App
                are both on. Rewards apply only to a new customer&apos;s first
                completed order.
              </Text>
            </View>

            <Text style={[styles.section, { marginTop: 18 }]}>
              Top referring drivers
            </Text>
            {topDrivers.length === 0 ? (
              <Text style={styles.empty}>No referring drivers yet.</Text>
            ) : (
              <View style={styles.topList}>
                {topDrivers.map((row) => (
                  <View key={row.driverId} style={styles.topCard}>
                    <Text style={styles.topName} numberOfLines={1}>
                      {row.driverName}
                    </Text>
                    <Text style={styles.topMeta}>
                      {row.successfulReferrals} successful ·{' '}
                      {row.totalReferrals} total · {formatMoney(row.rewardsCad)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.section, { marginTop: 18 }]}>
              Referral rewards
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No referral rewards yet.</Text>
        }
        renderItem={({ item }) => (
          <RewardCard
            item={item}
            busy={actingId === item.customerId}
            onPaid={() => void actOnReward(item.customerId, 'paid')}
            onCancel={() => void actOnReward(item.customerId, 'cancelled')}
          />
        )}
      />
    </SafeAreaView>
  );
}

function RewardCard({
  item,
  busy,
  onPaid,
  onCancel,
}: {
  item: DriverReferralHistoryRow;
  busy: boolean;
  onPaid: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.rewardCard}>
      <View style={styles.rewardTop}>
        <Text style={styles.rewardName} numberOfLines={1}>
          {item.customerName}
        </Text>
        <Text style={styles.rewardStatus}>{item.status}</Text>
      </View>
      <Text style={styles.rewardMeta}>
        {formatMoney(item.rewardAmountCad)}
        {item.orderDateMs
          ? ` · ${new Date(item.orderDateMs).toLocaleDateString()}`
          : ''}
      </Text>
      {item.status === 'approved' || item.status === 'pending' ? (
        <View style={styles.rewardActions}>
          {item.status === 'approved' ? (
            <Pressable
              style={styles.payBtn}
              disabled={busy}
              onPress={onPaid}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.payTxt}>Mark paid</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable
            style={styles.cancelBtn}
            disabled={busy}
            onPress={onCancel}
          >
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
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
  rewardCard: {
    ...adminCardShell,
    marginBottom: 10,
  },
  rewardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  rewardName: { flex: 1, color: COLORS.text, fontWeight: '800', fontSize: 14 },
  rewardStatus: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  rewardMeta: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  rewardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  payBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  payTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  cancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
  },
  cancelTxt: { color: '#F87171', fontWeight: '800', fontSize: 13 },
});
