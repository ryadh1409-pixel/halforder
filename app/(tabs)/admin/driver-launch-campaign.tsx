import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  markDriverLaunchBonusPaid,
  saveDriverLaunchCampaignSettings,
  subscribeDriverLaunchCampaignSettings,
  subscribeDriverLaunchEnrollments,
} from '@/services/driverLaunchCampaign';
import {
  DRIVER_LAUNCH_CAMPAIGN_DEFAULTS,
  buildDriverLaunchCampaignDashboard,
  type DriverLaunchCampaignSettings,
  type DriverLaunchEnrollment,
} from '@/types/driverLaunchCampaign';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useMemo, useState } from 'react';
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
  return `CA$${n.toFixed(2)}`;
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
  paused: boolean;
  bonusAmountCad: string;
  requiredDeliveries: string;
  eligibleDriverLimit: string;
  startInput: string;
  endInput: string;
  newDriversOnly: boolean;
  minDriverRating: string;
  maxCancellationRate: string;
};

function settingsToDraft(s: DriverLaunchCampaignSettings): Draft {
  return {
    enabled: s.enabled,
    paused: s.paused,
    bonusAmountCad: String(s.bonusAmountCad),
    requiredDeliveries: String(s.requiredDeliveries),
    eligibleDriverLimit: String(s.eligibleDriverLimit),
    startInput: formatDateInput(s.startAtMs),
    endInput: formatDateInput(s.endAtMs),
    newDriversOnly: s.newDriversOnly,
    minDriverRating:
      s.minDriverRating != null ? String(s.minDriverRating) : '',
    maxCancellationRate:
      s.maxCancellationRate != null
        ? String(Math.round(s.maxCancellationRate * 1000) / 10)
        : '',
  };
}

export default function AdminDriverLaunchCampaignScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [settings, setSettings] = useState<DriverLaunchCampaignSettings | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [enrollments, setEnrollments] = useState<DriverLaunchEnrollment[]>([]);
  const [saving, setSaving] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authorized) return undefined;
    return subscribeDriverLaunchCampaignSettings((next) => {
      setSettings(next);
      setDraft((prev) => prev ?? settingsToDraft(next));
    });
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return undefined;
    return subscribeDriverLaunchEnrollments(setEnrollments);
  }, [authorized]);

  const dash = useMemo(
    () =>
      settings
        ? buildDriverLaunchCampaignDashboard(settings)
        : buildDriverLaunchCampaignDashboard(
            {
              ...DRIVER_LAUNCH_CAMPAIGN_DEFAULTS,
              enrolledCount: 0,
              driversCompleted: 0,
              bonusesPaid: 0,
              totalBudgetPaidCad: 0,
              progressSum: 0,
              updatedAtMs: 0,
              updatedBy: null,
            },
          ),
    [settings],
  );

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const bonusAmountCad = Number(draft.bonusAmountCad);
      const requiredDeliveries = Number(draft.requiredDeliveries);
      const eligibleDriverLimit = Number(draft.eligibleDriverLimit);
      if (!(bonusAmountCad >= 0)) throw new Error('Invalid bonus amount');
      if (!(requiredDeliveries >= 1)) {
        throw new Error('Required deliveries must be at least 1');
      }
      if (!(eligibleDriverLimit >= 1)) {
        throw new Error('Eligible driver limit must be at least 1');
      }

      let minDriverRating: number | null = null;
      if (draft.minDriverRating.trim()) {
        minDriverRating = Number(draft.minDriverRating);
        if (!(minDriverRating >= 0 && minDriverRating <= 5)) {
          throw new Error('Min rating must be 0–5');
        }
      }

      let maxCancellationRate: number | null = null;
      if (draft.maxCancellationRate.trim()) {
        const pct = Number(draft.maxCancellationRate);
        if (!(pct >= 0 && pct <= 100)) {
          throw new Error('Max cancellation rate must be 0–100%');
        }
        maxCancellationRate = pct / 100;
      }

      await saveDriverLaunchCampaignSettings({
        enabled: draft.enabled,
        paused: draft.paused,
        bonusAmountCad,
        requiredDeliveries,
        eligibleDriverLimit,
        startAtMs: parseDateInput(draft.startInput),
        endAtMs: parseDateInput(draft.endInput),
        newDriversOnly: draft.newDriversOnly,
        minDriverRating,
        maxCancellationRate,
      });
      showSuccess('Campaign settings saved');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (driverId: string) => {
    setPayingId(driverId);
    try {
      await markDriverLaunchBonusPaid(driverId);
      showSuccess('Bonus marked as paid');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setPayingId(null);
    }
  };

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!draft) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <AdminHeader
          title="Driver Launch"
          subtitle="Limited enrollment campaign"
          fallbackRoute={adminRoutes.home}
        />
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AdminHeader
        title="Driver Launch"
        subtitle="Limited enrollment campaign"
        fallbackRoute={adminRoutes.home}
      />

      <FlatList
        data={enrollments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.section}>Dashboard</Text>
            <View style={styles.dashGrid}>
              <DashCell label="Status" value={dash.statusLabel} />
              <DashCell
                label="Eligible limit"
                value={String(dash.eligibleDriverLimit)}
              />
              <DashCell
                label="Drivers enrolled"
                value={String(dash.driversEnrolled)}
              />
              <DashCell
                label="Drivers remaining"
                value={String(dash.driversRemaining)}
              />
              <DashCell
                label="Drivers completed"
                value={String(dash.driversCompleted)}
              />
              <DashCell
                label="Bonuses paid"
                value={String(dash.bonusesPaid)}
              />
              <DashCell
                label="Budget allocated"
                value={formatMoney(dash.totalBudgetAllocatedCad)}
              />
              <DashCell
                label="Budget paid"
                value={formatMoney(dash.totalBudgetPaidCad)}
              />
              <DashCell
                label="Remaining budget"
                value={formatMoney(dash.remainingBudgetCad)}
              />
              <DashCell
                label="Avg progress"
                value={`${dash.averageDriverProgress}%`}
              />
            </View>

            <Text style={[styles.section, { marginTop: 18 }]}>Controls</Text>
            <View style={styles.formCard}>
              <RowSwitch
                label="Enable promotion"
                value={draft.enabled}
                onChange={(v) => setDraft((d) => (d ? { ...d, enabled: v } : d))}
              />
              <RowSwitch
                label="Pause promotion"
                value={draft.paused}
                onChange={(v) => setDraft((d) => (d ? { ...d, paused: v } : d))}
              />
              <Text style={styles.label}>Bonus amount (CAD)</Text>
              <AppTextInput
                value={draft.bonusAmountCad}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, bonusAmountCad: t } : d))
                }
                keyboardType="decimal-pad"
                placeholder={String(DRIVER_LAUNCH_CAMPAIGN_DEFAULTS.bonusAmountCad)}
              />
              <Text style={styles.label}>Required completed deliveries</Text>
              <AppTextInput
                value={draft.requiredDeliveries}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, requiredDeliveries: t } : d))
                }
                keyboardType="number-pad"
                placeholder={String(
                  DRIVER_LAUNCH_CAMPAIGN_DEFAULTS.requiredDeliveries,
                )}
              />
              <Text style={styles.label}>Eligible driver limit</Text>
              <AppTextInput
                value={draft.eligibleDriverLimit}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, eligibleDriverLimit: t } : d))
                }
                keyboardType="number-pad"
                placeholder={String(
                  DRIVER_LAUNCH_CAMPAIGN_DEFAULTS.eligibleDriverLimit,
                )}
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
              <RowSwitch
                label="New drivers only"
                value={draft.newDriversOnly}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, newDriversOnly: v } : d))
                }
              />
              <Text style={styles.label}>Minimum driver rating (0–5)</Text>
              <AppTextInput
                value={draft.minDriverRating}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, minDriverRating: t } : d))
                }
                keyboardType="decimal-pad"
                placeholder="Optional"
              />
              <Text style={styles.label}>Max cancellation rate (%)</Text>
              <AppTextInput
                value={draft.maxCancellationRate}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, maxCancellationRate: t } : d))
                }
                keyboardType="decimal-pad"
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
              <Text style={styles.hint}>
                Seat reservations use an atomic transaction. The limit can never
                be exceeded. Enrolled drivers keep their seat until they unlock
                the bonus or the promotion ends.
              </Text>
            </View>

            <Text style={[styles.section, { marginTop: 18 }]}>
              Enrolled drivers
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No drivers enrolled yet.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.enrollCard}>
            <View style={styles.enrollTop}>
              <Text style={styles.enrollName} numberOfLines={1}>
                #{item.slotIndex} · {item.driverName}
              </Text>
              <Text style={styles.enrollStatus}>{item.status}</Text>
            </View>
            <Text style={styles.enrollMeta}>
              {item.completedDeliveries}/{item.requiredDeliveries} deliveries ·{' '}
              {formatMoney(item.bonusAmountCad)}
            </Text>
            {item.status === 'bonus_unlocked' ? (
              <Pressable
                style={styles.payBtn}
                disabled={payingId === item.driverId}
                onPress={() => void markPaid(item.driverId)}
              >
                {payingId === item.driverId ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.payTxt}>Mark bonus paid</Text>
                )}
              </Pressable>
            ) : null}
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
    marginBottom: 4,
  },
  dashValue: { color: COLORS.text, fontSize: 15, fontWeight: '900' },
  formCard: {
    ...adminCardShell,
    padding: 14,
    gap: 4,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  switchLabel: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  saveBtn: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: '900' },
  hint: {
    marginTop: 10,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  empty: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 20,
    fontWeight: '600',
  },
  enrollCard: {
    ...adminCardShell,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  enrollTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  enrollName: { flex: 1, color: COLORS.text, fontWeight: '900', fontSize: 15 },
  enrollStatus: {
    color: COLORS.accentGreen,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  enrollMeta: { color: COLORS.textMuted, fontWeight: '600', fontSize: 12 },
  payBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  payTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
