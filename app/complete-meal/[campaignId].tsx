import { CompleteMealProgressBar } from '@/components/completeMeal/CompleteMealProgressBar';
import { CK } from '@/constants/checkoutUi';
import {
    buildCompleteMealShareUrl,
    shareCompleteMealInvite,
} from '@/lib/completeMealShare';
import {
    cancelCompleteMealCampaign,
    getCompleteMealCampaign,
} from '@/services/completeMeal/callables';
import type { CompleteMealCampaignPublic } from '@/types/completeMeal';
import { moneyLabelFromCents } from '@/types/completeMeal';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CompleteMealOwnerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ campaignId: string }>();
  const campaignId =
    typeof params.campaignId === 'string' ? params.campaignId : '';

  const [campaign, setCampaign] = useState<CompleteMealCampaignPublic | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!campaignId) return;
    try {
      const data = await getCompleteMealCampaign({ campaignId });
      setCampaign(data);
      if (data.status === 'ordered' && data.orderId) {
        router.replace({
          pathname: '/track-order/[orderId]',
          params: { orderId: data.orderId },
        } as never);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not load campaign.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, router]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  if (loading || !campaign) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={CK.blackBtn} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const funded =
    campaign.status === 'funded' ||
    campaign.status === 'ordered' ||
    campaign.remainingCents <= 0;

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
        {funded ? (
          <Text style={styles.heroDone}>🎉 This meal has been completed!</Text>
        ) : (
          <>
            <Text style={styles.hero}>Complete My Meal</Text>
            <Text style={styles.subline}>
              You paid {moneyLabelFromCents(campaign.paidCents)} · Still needed{' '}
              {moneyLabelFromCents(campaign.remainingCents)}
            </Text>
          </>
        )}

        <View style={styles.card}>
          <Row label="Still needed" value={moneyLabelFromCents(campaign.remainingCents)} />
          <Row label="Order total" value={moneyLabelFromCents(campaign.totalCents)} />
          <CompleteMealProgressBar
            progressRatio={campaign.progressRatio}
            paidLabel={moneyLabelFromCents(campaign.paidCents)}
            remainingLabel={moneyLabelFromCents(campaign.remainingCents)}
          />
        </View>

        <Text style={styles.section}>Contributors</Text>
        {campaign.contributors.length === 0 ? (
          <Text style={styles.empty}>No contributions yet — share your link.</Text>
        ) : (
          campaign.contributors.map((c) => (
            <View key={c.contributionId} style={styles.contrib}>
              <Text style={styles.contribName}>{c.displayName}</Text>
              <Text style={styles.contribAmt}>
                {moneyLabelFromCents(c.amountCents)}
              </Text>
            </View>
          ))
        )}

        {!funded ? (
          <View style={styles.actions}>
            <Pressable
              style={styles.primary}
              onPress={() =>
                void shareCompleteMealInvite({
                  shareToken: campaign.shareToken,
                  ownerFirstName: campaign.ownerFirstName,
                  restaurantName: campaign.restaurantName,
                  remainingCents: campaign.remainingCents,
                })
              }
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.primaryTxt}>Share Link</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                await Clipboard.setStringAsync(
                  buildCompleteMealShareUrl(campaign.shareToken),
                );
                showSuccess('Link copied');
              }}
            >
              <Text style={styles.secondaryTxt}>Copy Link</Text>
            </Pressable>
            {campaign.canCancel ? (
              <Pressable
                style={styles.cancel}
                disabled={busy}
                onPress={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      await cancelCompleteMealCampaign(campaign.campaignId);
                      showSuccess('Request cancelled');
                      router.back();
                    } catch (e) {
                      showError(
                        e instanceof Error ? e.message : 'Could not cancel.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <Text style={styles.cancelTxt}>Cancel Request</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
  hero: { fontSize: 22, fontWeight: '900', color: CK.text, marginTop: 4 },
  subline: {
    fontSize: 15,
    fontWeight: '700',
    color: CK.textSecondary,
    marginBottom: 4,
  },
  heroDone: { fontSize: 22, fontWeight: '900', color: CK.accent, marginTop: 4 },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.surface,
    gap: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: CK.textSecondary, fontWeight: '700' },
  rowValue: { color: CK.text, fontWeight: '900' },
  section: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    color: CK.textSecondary,
    textTransform: 'uppercase',
  },
  empty: { color: CK.textMuted, fontWeight: '600' },
  contrib: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CK.border,
  },
  contribName: { color: CK.text, fontWeight: '800' },
  contribAmt: { color: CK.blackBtn, fontWeight: '900' },
  actions: { marginTop: 16, gap: 10 },
  primary: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: CK.blackBtn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelTxt: { color: '#F87171', fontWeight: '800' },
});
