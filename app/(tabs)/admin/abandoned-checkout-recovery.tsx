import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  buildOfferLabel,
  formatOfferTypeLabel,
  saveAbandonedCheckoutConfig,
  subscribeAbandonedCheckoutAnalytics,
  subscribeAbandonedCheckoutConfig,
} from '@/services/abandonedCheckoutConfig';
import {
  DEFAULT_ABANDONED_CHECKOUT_CONFIG,
  EMPTY_ABANDONED_CHECKOUT_ANALYTICS,
  type AbandonedCheckoutAnalytics,
  type AbandonedCheckoutConfig,
  type AbandonedCheckoutOfferType,
} from '@/types/abandonedCheckoutRecovery';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const OFFER_TYPES: AbandonedCheckoutOfferType[] = [
  'free_delivery',
  'free_service_fee',
  'percent_discount',
  'fixed_discount',
  'reward_points',
];

type Draft = AbandonedCheckoutConfig;

function numStr(n: number): string {
  return String(n);
}

function parsePositive(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminAbandonedCheckoutRecoveryScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [analytics, setAnalytics] = useState<AbandonedCheckoutAnalytics>(
    EMPTY_ABANDONED_CHECKOUT_ANALYTICS,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authorized) return undefined;
    return subscribeAbandonedCheckoutConfig((next) => {
      setDraft((prev) => prev ?? { ...next });
    });
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return undefined;
    return subscribeAbandonedCheckoutAnalytics(setAnalytics);
  }, [authorized]);

  const conversionRate = useMemo(() => {
    if (analytics.abandonedCheckouts <= 0) return '0%';
    const pct =
      (analytics.recoveredOrders / analytics.abandonedCheckouts) * 100;
    return `${pct.toFixed(1)}%`;
  }, [analytics.abandonedCheckouts, analytics.recoveredOrders]);

  const avgRecovery = useMemo(() => {
    if (analytics.recoveredWithTimingCount <= 0) return '—';
    const mins =
      analytics.totalRecoveryTimeMs /
      analytics.recoveredWithTimingCount /
      60000;
    return `${mins.toFixed(1)} min`;
  }, [analytics.totalRecoveryTimeMs, analytics.recoveredWithTimingCount]);

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveAbandonedCheckoutConfig(draft);
      showSuccess('Abandoned checkout recovery settings saved');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
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
          title="Checkout Recovery"
          subtitle="Abandoned checkout automation"
          fallbackRoute={adminRoutes.home}
        />
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  const offerPreview = buildOfferLabel(draft.offerType, draft.offerValue);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AdminHeader
        title="Checkout Recovery"
        subtitle="Abandoned checkout automation"
        fallbackRoute={adminRoutes.home}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>Analytics</Text>
        <View style={styles.dashGrid}>
          <DashCell label="Abandoned" value={String(analytics.abandonedCheckouts)} />
          <DashCell label="Recovered" value={String(analytics.recoveredOrders)} />
          <DashCell label="Conversion" value={conversionRate} />
          <DashCell label="Notifs sent" value={String(analytics.notificationsSent)} />
          <DashCell label="Notifs opened" value={String(analytics.notificationsOpened)} />
          <DashCell label="Offers generated" value={String(analytics.offersGenerated)} />
          <DashCell label="Offers redeemed" value={String(analytics.offersRedeemed)} />
          <DashCell label="Avg recovery" value={avgRecovery} />
        </View>

        <Text style={styles.section}>Master controls</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Master Enable / Disable"
            value={draft.enabled}
            onChange={(v) => patch('enabled', v)}
          />
          <ToggleRow
            label="Enable Recovery Automation"
            value={draft.enableRecoveryAutomation}
            onChange={(v) => patch('enableRecoveryAutomation', v)}
          />
          <ToggleRow
            label="Enable Push Notifications"
            value={draft.enablePushNotifications}
            onChange={(v) => patch('enablePushNotifications', v)}
          />
          <ToggleRow
            label="Enable Recovery Offers"
            value={draft.enableRecoveryOffers}
            onChange={(v) => patch('enableRecoveryOffers', v)}
          />
          <ToggleRow
            label="Enable Reminder Notifications"
            value={draft.enableReminderNotifications}
            onChange={(v) => patch('enableReminderNotifications', v)}
            last
          />
        </View>

        <Text style={styles.section}>Timing</Text>
        <View style={styles.card}>
          <Field
            label="Notification Delay #1 (minutes)"
            value={numStr(draft.notificationDelay1Minutes)}
            onChange={(t) =>
              patch(
                'notificationDelay1Minutes',
                Math.max(1, Math.floor(parsePositive(t, draft.notificationDelay1Minutes))),
              )
            }
            keyboard="numeric"
          />
          <Field
            label="Notification Delay #2 (minutes after #1)"
            value={numStr(draft.notificationDelay2Minutes)}
            onChange={(t) =>
              patch(
                'notificationDelay2Minutes',
                Math.max(1, Math.floor(parsePositive(t, draft.notificationDelay2Minutes))),
              )
            }
            keyboard="numeric"
          />
          <Field
            label="Offer Expiration (minutes)"
            value={numStr(draft.offerExpirationMinutes)}
            onChange={(t) =>
              patch(
                'offerExpirationMinutes',
                Math.max(5, Math.floor(parsePositive(t, draft.offerExpirationMinutes))),
              )
            }
            keyboard="numeric"
            last
          />
        </View>

        <Text style={styles.section}>Anti-abuse</Text>
        <View style={styles.card}>
          <Field
            label="Minimum Abandoned Checkouts Before Offer"
            value={numStr(draft.minAbandonedCheckoutsBeforeOffer)}
            onChange={(t) =>
              patch(
                'minAbandonedCheckoutsBeforeOffer',
                Math.max(2, Math.floor(parsePositive(t, draft.minAbandonedCheckoutsBeforeOffer))),
              )
            }
            keyboard="numeric"
          />
          <Field
            label="Cooldown Between Offers (hours)"
            value={numStr(draft.cooldownHoursBetweenOffers)}
            onChange={(t) =>
              patch(
                'cooldownHoursBetweenOffers',
                Math.max(1, Math.floor(parsePositive(t, draft.cooldownHoursBetweenOffers))),
              )
            }
            keyboard="numeric"
          />
          <Field
            label="Maximum Offers Per Customer"
            value={numStr(draft.maxOffersPerCustomer)}
            onChange={(t) =>
              patch(
                'maxOffersPerCustomer',
                Math.max(1, Math.floor(parsePositive(t, draft.maxOffersPerCustomer))),
              )
            }
            keyboard="numeric"
          />
          <Field
            label="Maximum Recovery Attempts Per Order"
            value={numStr(draft.maxRecoveryAttemptsPerOrder)}
            onChange={(t) =>
              patch(
                'maxRecoveryAttemptsPerOrder',
                Math.max(1, Math.floor(parsePositive(t, draft.maxRecoveryAttemptsPerOrder))),
              )
            }
            keyboard="numeric"
            last
          />
        </View>

        <Text style={styles.section}>Offer</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Offer Type</Text>
          <View style={styles.typeGrid}>
            {OFFER_TYPES.map((type) => {
              const selected = draft.offerType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => patch('offerType', type)}
                  style={[styles.typeChip, selected && styles.typeChipOn]}
                >
                  <Text style={[styles.typeTxt, selected && styles.typeTxtOn]}>
                    {formatOfferTypeLabel(type)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Field
            label="Offer Value (% / $ / points)"
            value={numStr(draft.offerValue)}
            onChange={(t) =>
              patch('offerValue', Math.max(0, parsePositive(t, draft.offerValue)))
            }
            keyboard="numeric"
            last
          />
        </View>

        <Text style={styles.section}>Preview Notification</Text>
        <View style={styles.card}>
          <Field
            label="Title"
            value={draft.previewNotificationTitle}
            onChange={(t) => patch('previewNotificationTitle', t)}
          />
          <Field
            label="Body"
            value={draft.previewNotificationBody}
            onChange={(t) => patch('previewNotificationBody', t)}
            last
          />
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>{draft.previewNotificationTitle}</Text>
            <Text style={styles.previewBody}>{draft.previewNotificationBody}</Text>
          </View>
        </View>

        <Text style={styles.section}>Preview Offer</Text>
        <View style={styles.card}>
          <Field
            label="Title"
            value={draft.previewOfferTitle}
            onChange={(t) => patch('previewOfferTitle', t)}
          />
          <Field
            label="Body"
            value={draft.previewOfferBody}
            onChange={(t) => patch('previewOfferBody', t)}
            last
          />
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>{draft.previewOfferTitle}</Text>
            <Text style={styles.previewBody}>
              {draft.previewOfferBody}
              {'\n'}
              {offerPreview}
            </Text>
          </View>
        </View>

        <Pressable
          style={[styles.saveBtn, saving && styles.saveDisabled]}
          disabled={saving}
          onPress={() => void save()}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveTxt}>Save settings</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.resetBtn}
          onPress={() => setDraft({ ...DEFAULT_ABANDONED_CHECKOUT_CONFIG })}
        >
          <Text style={styles.resetTxt}>Reset to defaults</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function DashCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dashCell}>
      <Text style={styles.dashVal}>{value}</Text>
      <Text style={styles.dashLabel}>{label}</Text>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  last,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, !last && styles.rowBorder]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#334155', true: COLORS.primary }}
      />
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboard,
  last,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  keyboard?: 'numeric';
  last?: boolean;
}) {
  return (
    <View style={[styles.fieldWrap, !last && styles.rowBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <AppTextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 48 },
  section: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  card: {
    ...adminCardShell,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  dashGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dashCell: {
    ...adminCardShell,
    width: '47%',
    flexGrow: 1,
    padding: 12,
  },
  dashVal: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  dashLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.25)',
  },
  fieldWrap: { paddingVertical: 10 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  typeChipOn: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(59,130,246,0.18)',
  },
  typeTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  typeTxtOn: { color: COLORS.text },
  previewBox: {
    marginTop: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  previewBody: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  saveBtn: {
    marginTop: 24,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.7 },
  saveTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  resetBtn: {
    marginTop: 12,
    alignItems: 'center',
    padding: 10,
  },
  resetTxt: {
    color: COLORS.textMuted,
    fontWeight: '700',
    fontSize: 13,
  },
});
