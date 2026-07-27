import { CompleteMealProgressBar } from '@/components/completeMeal/CompleteMealProgressBar';
import { CK } from '@/constants/checkoutUi';
import {
  COMPLETE_MEAL_MIN_CONTRIBUTION_CENTS,
  COMPLETE_MEAL_PRESET_DOLLARS,
} from '@/constants/completeMeal';
import {
  getCompleteMealCampaign,
} from '@/services/completeMeal/callables';
import { payCompleteMealContribution } from '@/services/completeMeal/payCompleteMeal';
import { useAuth } from '@/services/AuthContext';
import type { CompleteMealCampaignPublic } from '@/types/completeMeal';
import { moneyLabelFromCents } from '@/types/completeMeal';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CompleteMealContributeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ shareToken: string }>();
  const shareToken =
    typeof params.shareToken === 'string' ? params.shareToken : '';

  const [campaign, setCampaign] = useState<CompleteMealCampaignPublic | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');

  const refresh = useCallback(async () => {
    if (!shareToken) return;
    try {
      const data = await getCompleteMealCampaign({ shareToken });
      setCampaign(data);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Campaign not found.');
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const contribute = async (amountCents: number) => {
    if (!campaign) return;
    if (!user || user.isAnonymous) {
      router.push(
        `/(auth)/login?redirectTo=/complete-meal/contribute/${encodeURIComponent(shareToken)}` as never,
      );
      return;
    }
    if (campaign.remainingCents <= 0 || campaign.status === 'ordered') {
      showSuccess('This meal is already completed.');
      return;
    }
    const cents = Math.min(amountCents, campaign.remainingCents);
    if (cents < COMPLETE_MEAL_MIN_CONTRIBUTION_CENTS) {
      showError('Minimum contribution is $0.50.');
      return;
    }
    setBusy(true);
    try {
      const result = await payCompleteMealContribution({
        campaignId: campaign.campaignId,
        amountCents: cents,
      });
      if (result.status === 'canceled') return;
      if (result.status === 'failed') {
        showError(result.message);
        return;
      }
      showSuccess(
        result.funded
          ? '🎉 This meal has been completed!'
          : 'Thanks — payment successful',
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !campaign) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={CK.blackBtn} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const done =
    campaign.remainingCents <= 0 ||
    campaign.status === 'funded' ||
    campaign.status === 'ordered';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={CK.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Complete My Meal</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {done ? (
          <Text style={styles.done}>🎉 This meal has been completed!</Text>
        ) : (
          <>
            <Text style={styles.hero}>
              🍔 Help Complete {campaign.ownerFirstName}'s Meal
            </Text>
            <Text style={styles.sub}>
              {campaign.ownerFirstName} is craving {campaign.restaurantName}
            </Text>
          </>
        )}

        <View style={styles.card}>
          <Meta label="Restaurant" value={campaign.restaurantName} />
          <Meta label="Meal" value={campaign.mealLabel} />
          <Meta label="Order Total" value={moneyLabelFromCents(campaign.totalCents)} />
          <Meta label="Already Paid" value={moneyLabelFromCents(campaign.paidCents)} />
          <Meta label="Remaining" value={moneyLabelFromCents(campaign.remainingCents)} />
          <CompleteMealProgressBar
            progressRatio={campaign.progressRatio}
            paidLabel={moneyLabelFromCents(campaign.paidCents)}
            remainingLabel={moneyLabelFromCents(campaign.remainingCents)}
          />
        </View>

        {!done ? (
          <View style={styles.actions}>
            {COMPLETE_MEAL_PRESET_DOLLARS.map((d) => {
              const cents = d * 100;
              if (cents > campaign.remainingCents) return null;
              return (
                <Pressable
                  key={d}
                  style={[styles.primary, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => void contribute(cents)}
                >
                  <Text style={styles.primaryTxt}>Pay ${d}</Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.primary, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void contribute(campaign.remainingCents)}
            >
              <Text style={styles.primaryTxt}>
                Pay Remaining ({moneyLabelFromCents(campaign.remainingCents)})
              </Text>
            </Pressable>

            <Text style={styles.customLabel}>Or enter custom amount</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="8.00"
              placeholderTextColor={CK.textMuted}
              value={custom}
              onChangeText={setCustom}
            />
            <Pressable
              style={[styles.secondary, busy && styles.disabled]}
              disabled={busy}
              onPress={() => {
                const n = Number.parseFloat(custom);
                if (!Number.isFinite(n) || n <= 0) {
                  showError('Enter a valid amount.');
                  return;
                }
                void contribute(Math.round(n * 100));
              }}
            >
              {busy ? (
                <ActivityIndicator color={CK.text} />
              ) : (
                <Text style={styles.secondaryTxt}>Contribute</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <Pressable
          style={styles.join}
          onPress={() =>
            router.push(
              `/restaurant-menu/${encodeURIComponent(campaign.restaurantId)}` as never,
            )
          }
        >
          <Text style={styles.joinTitle}>Join This Order</Text>
          <Text style={styles.joinBody}>
            Craving the same restaurant? Start your own order from{' '}
            {campaign.restaurantName}.
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CK.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 17,
    color: CK.text,
  },
  body: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  hero: { fontSize: 24, fontWeight: '900', color: CK.text, lineHeight: 32 },
  sub: { fontSize: 15, fontWeight: '600', color: CK.textSecondary },
  done: { fontSize: 24, fontWeight: '900', color: CK.accent },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.surface,
    gap: 8,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaLabel: { color: CK.textSecondary, fontWeight: '700' },
  metaValue: { color: CK.text, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  actions: { gap: 10, marginTop: 8 },
  primary: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: CK.blackBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondary: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CK.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryTxt: { color: CK.text, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  customLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: CK.textSecondary,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.surface,
    paddingHorizontal: 14,
    color: CK.text,
    fontWeight: '700',
    fontSize: 16,
  },
  join: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  joinTitle: { color: CK.blackBtn, fontWeight: '900', fontSize: 15 },
  joinBody: {
    marginTop: 4,
    color: CK.textSecondary,
    fontWeight: '600',
    lineHeight: 19,
  },
});
