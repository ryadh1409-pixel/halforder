import { CompleteMealAmountPicker } from '@/components/completeMeal/CompleteMealAmountPicker';
import { CK } from '@/constants/checkoutUi';
import {
  createCompleteMealCampaign,
} from '@/services/completeMeal/callables';
import { payCompleteMealContribution } from '@/services/completeMeal/payCompleteMeal';
import {
  clearPendingCompleteMealDraft,
  peekPendingCompleteMealDraft,
} from '@/services/completeMeal/pendingDraft';
import { useCart } from '@/services/CartContext';
import { useAuth } from '@/services/AuthContext';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CompleteMealSetupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { clearCartForRestaurant } = useCart();
  const draft = useMemo(() => peekPendingCompleteMealDraft(), []);
  const [busy, setBusy] = useState(false);

  if (!draft) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No meal ready</Text>
          <Text style={styles.emptyBody}>
            Start from checkout and choose Complete My Meal.
          </Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnTxt}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const totalCents = Math.round(draft.totalPrice * 100);

  const start = async (ownerPayCents: number) => {
    if (!user || user.isAnonymous) {
      showError('Please sign in first.');
      return;
    }
    setBusy(true);
    try {
      if (ownerPayCents >= totalCents) {
        clearPendingCompleteMealDraft();
        showError('Use Pay Full Amount in checkout to place the full order.');
        router.back();
        return;
      }

      const firstName =
        typeof (user as { displayName?: string }).displayName === 'string'
          ? (user as { displayName?: string }).displayName!.split(/\s+/)[0]
          : undefined;

      const created = await createCompleteMealCampaign({
        orderDraft: draft,
        ownerPayCents,
        ownerFirstName: firstName,
      });

      const pay = await payCompleteMealContribution({
        campaignId: created.campaignId,
        amountCents: created.ownerPayCents,
      });

      if (pay.status === 'canceled') {
        showError('Payment cancelled.');
        return;
      }
      if (pay.status === 'failed') {
        showError(pay.message);
        return;
      }

      clearPendingCompleteMealDraft();
      clearCartForRestaurant(draft.restaurantId);
      showSuccess('You’re in — share the link with friends');
      router.replace({
        pathname: '/complete-meal/[campaignId]',
        params: { campaignId: created.campaignId },
      } as never);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not start Complete My Meal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={CK.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Complete My Meal</Text>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.rest}>{draft.restaurantName}</Text>
        <CompleteMealAmountPicker
          totalCents={totalCents}
          busy={busy}
          onContinue={(cents) => void start(cents)}
        />
      </ScrollView>
    </SafeAreaView>
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
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '900', fontSize: 17, color: CK.text },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  rest: {
    marginBottom: 12,
    fontSize: 14,
    fontWeight: '700',
    color: CK.textSecondary,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: CK.text },
  emptyBody: { textAlign: 'center', color: CK.textSecondary, fontWeight: '600' },
  backBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: CK.blackBtn,
  },
  backBtnTxt: { color: '#fff', fontWeight: '800' },
});
