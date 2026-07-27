import { TABS_ROUTES, USER_ROUTES } from '@/lib/navigationPaths';
import { confirmCancelMatch } from '@/hooks/useFoodShareUx';
import { FoodSharePricingCard } from '@/components/foodShare/FoodSharePricingCard';
import { formatShareCurrency } from '@/lib/foodSharePricing';
import { isPickupFulfillment } from '@/lib/foodShareFulfillment';
import {
  FOOD_SHARE_ERRORS,
  FOOD_SHARE_SUCCESS,
  foodShareErrorMessage,
} from '@/lib/foodShareUx';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { cancelFoodShareMatch, mapMatchDoc } from '@/services/foodShareMatchService';
import { confirmFoodSharePickup } from '@/services/foodSharePickup';
import { payFoodShareMatch, confirmFoodSharePaymentAfterRedirect } from '@/services/foodSharePayment';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showError, showSuccess } from '@/utils/toast';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { sanitizeUserFacingMessage } from '@/utils/errorMessages';

const c = theme.colors;

type Phase = 'loading' | 'ready' | 'paying' | 'confirming' | 'error';

export default function FoodSharePayScreen() {
  const router = useRouter();
  const { matchId, paid, canceled } = useLocalSearchParams<{
    matchId?: string;
    paid?: string;
    canceled?: string;
  }>();
  const id = (() => {
    const raw = typeof matchId === 'string' ? matchId : '';
    if (!raw) return '';
    try {
      return decodeURIComponent(raw.trim());
    } catch {
      return raw.trim();
    }
  })();
  const myUid = auth.currentUser?.uid ?? '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [cancelling, setCancelling] = useState(false);
  const [confirmingPickup, setConfirmingPickup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<ReturnType<typeof mapMatchDoc> | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!id) {
      setPhase('error');
      setError('Missing match.');
      return undefined;
    }
    console.log('[PAYMENT START]', {
      screen: 'food-share-pay',
      matchId: id,
      rawMatchId: matchId,
      routerParams: { matchId, paid, canceled },
    });
    const ref = doc(db, 'matches', id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError('Match not found.');
          setMatch(null);
          setPhase('error');
          return;
        }
        const mapped = mapMatchDoc(snap.id, snap.data() as Record<string, unknown>);
        setMatch(mapped);
        setError(null);
        if (
          mapped.lifecycle === 'MATCHED' ||
          mapped.lifecycle === 'ORDER_PLACED' ||
          mapped.lifecycle === 'PICKED_UP' ||
          mapped.status === 'MATCHED'
        ) {
          console.log('[MATCH FLOW STEP]', {
            step: 'payment_complete_open_chat',
            matchId: id,
            matchChatId: mapped.matchChatId ?? id,
          });
          router.replace(USER_ROUTES.foodShareChat(id) as never);
          return;
        }
        if (mapped.status === 'CANCELLED') {
          setPhase('error');
          setError('This match was cancelled.');
          return;
        }
        const myStatus = mapped.userPayments[myUid]?.paymentStatus;
        const myPaid = myStatus === 'PAID';
        const myHostNotRequired = myStatus === 'NOT_REQUIRED';
        if (myHostNotRequired) {
          setPhase('ready');
          return;
        }
        if (
          myPaid &&
          (mapped.lifecycle === 'PAYMENT_CONFIRMED' ||
            mapped.lifecycle === 'WAITING_FOR_PAYMENT_CONFIRMATION')
        ) {
          setPhase('confirming');
          return;
        }
        if (myPaid) {
          setPhase('confirming');
          return;
        }
        setPhase('ready');
      },
      (err) => {
        setError(foodShareErrorMessage(err, FOOD_SHARE_ERRORS.connectionLost));
        setPhase('error');
      },
    );
    return unsub;
  }, [id, myUid, router]);

  const partner = useMemo(() => {
    if (!match || !myUid) return null;
    if (match.userA.uid === myUid) return match.userB;
    if (match.userB.uid === myUid) return match.userA;
    return match.userA;
  }, [match, myUid]);

  const isPickup = isPickupFulfillment(match?.fulfillmentMode);
  const isPickupHost =
    isPickup && !!myUid && match?.pickupHostUid === myUid;
  const joinerPaid = match?.pickupJoinerUid
    ? match.userPayments[match.pickupJoinerUid]?.paymentStatus === 'PAID'
    : false;
  const partnerPaid = partner
    ? match?.userPayments[partner.uid]?.paymentStatus === 'PAID' ||
      match?.userPayments[partner.uid]?.paymentStatus === 'NOT_REQUIRED'
    : false;
  const anyPaymentCompleted = match
    ? Object.values(match.userPayments).some((payment) => payment.paymentStatus === 'PAID')
    : false;
  const canShowCancel =
    !!match &&
    (
      match.lifecycle === 'WAITING_FOR_PARTNER' ||
      match.lifecycle === 'WAITING_FOR_PAYMENT' ||
      match.lifecycle === 'WAITING_FOR_PAYMENT_CONFIRMATION'
    );

  const runPayment = useCallback(async () => {
    if (!id || cancelling || isPickupHost) return;
    console.log('[STRIPE STEP] pay_button_pressed', {
      matchId: id,
      rawMatchId: matchId,
      uid: auth.currentUser?.uid ?? null,
    });
    setPhase('paying');
    try {
      console.log('[STRIPE STEP] loading_match', id);
      await ensureAuthReady();
      if (!auth.currentUser || auth.currentUser.isAnonymous) {
        setPhase('ready');
        const message = FOOD_SHARE_ERRORS.signInRequired;
        showError(message);
        Alert.alert('Payment Error', message);
        router.replace('/(auth)/login');
        return;
      }
      const result = await payFoodShareMatch({
        matchId: id,
        merchantDisplayName: 'HalfOrder',
      });
      if (result.status === 'canceled') {
        setPhase('ready');
        showError(FOOD_SHARE_ERRORS.paymentCanceled);
        return;
      }
      if (result.status === 'failed') {
        setPhase('ready');
        const message = getUserFriendlyError(result.message || result, {
          context: 'payment',
          fallback: FOOD_SHARE_ERRORS.paymentFailed,
        });
        showError(message);
        Alert.alert('Payment Error', message);
        return;
      }
      if (result.status === 'redirected') {
        setPhase('confirming');
        showSuccess(FOOD_SHARE_SUCCESS.paymentSubmitted);
        return;
      }
      setPhase('confirming');
      showSuccess(FOOD_SHARE_SUCCESS.paymentSubmitted);
    } catch (e) {
      setPhase('ready');
      const message = foodShareErrorMessage(e, FOOD_SHARE_ERRORS.paymentFailed);
      console.error('[STRIPE ERROR]', e);
      showError(message);
      Alert.alert('Payment Error', message);
    }
  }, [cancelling, id, isPickupHost, matchId, router]);

  const handleConfirmPickup = useCallback(async () => {
    if (!id || confirmingPickup) return;
    setConfirmingPickup(true);
    try {
      await confirmFoodSharePickup(id);
      showSuccess('Pickup confirmed. Your partner\'s payment was released to reimburse you.');
      router.replace(USER_ROUTES.foodShareChat(id) as never);
    } catch (e) {
      showError(foodShareErrorMessage(e, 'Could not confirm pickup.'));
    } finally {
      setConfirmingPickup(false);
    }
  }, [confirmingPickup, id, router]);

  const handleCancelShare = useCallback(async () => {
    if (!id || !match || cancelling) return;
    if (match.lifecycle === 'WAITING_FOR_PAYMENT_CONFIRMATION' && anyPaymentCompleted) {
      showError('Payment already submitted and cannot be cancelled from the app.');
      return;
    }
    const ok = await confirmCancelMatch(match.foodName);
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelFoodShareMatch({
        matchId: id,
        partnerUid: partner?.uid,
        cancelledByFirstName:
          match.userA.uid === myUid ? match.userA.firstName : match.userB.firstName,
        foodName: match.foodName,
        adminFoodShareId: match.adminFoodShareId,
      });
      showSuccess(isPickup ? 'Pickup cancelled' : 'Share cancelled');
      router.replace(TABS_ROUTES.swipe as never);
    } catch (e) {
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.cancelFailed));
    } finally {
      setCancelling(false);
    }
  }, [anyPaymentCompleted, cancelling, id, isPickup, match, myUid, partner?.uid, router]);

  useEffect(() => {
    if (paid === '1' && !started.current && phase === 'ready' && !isPickupHost) {
      started.current = true;
      setPhase('confirming');
      void (async () => {
        try {
          await confirmFoodSharePaymentAfterRedirect({ matchId: id });
          showSuccess(FOOD_SHARE_SUCCESS.paymentSubmitted);
        } catch (e) {
          console.error('[STRIPE ERROR]', e);
          const message = foodShareErrorMessage(e, FOOD_SHARE_ERRORS.paymentFailed);
          showError(message);
          Alert.alert('Payment Error', message);
          setPhase('ready');
        }
      })();
    }
    if (canceled === '1' && !started.current) {
      started.current = true;
      showError(FOOD_SHARE_ERRORS.paymentCanceled);
    }
  }, [paid, canceled, phase, id, isPickupHost]);

  if (phase === 'loading' || !match) {
    return (
      <View style={[styles.centered, { backgroundColor: c.sheetDark }]}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={styles.hint}>Loading payment…</Text>
      </View>
    );
  }

  if (error || phase === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.pad}>
          <Text style={styles.title}>Payment</Text>
          <Text style={styles.errorText}>{error ?? 'Unable to load payment.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnTxt}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const breakdown = match.costBreakdown;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SwipeCinematicBackground />
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>

        <Text style={styles.kicker}>
          {isPickup ? 'Secure pickup checkout' : 'Secure checkout'}
        </Text>
        <Text style={styles.foodName}>{match.foodName}</Text>
        <Text style={styles.restaurant}>{match.restaurantName}</Text>

        {match.foodImageUrl ? (
          <Image source={{ uri: match.foodImageUrl }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPh]} />
        )}

        <FoodSharePricingCard
          pricing={breakdown}
          variant="payment"
          showTax
          fulfillmentMode={match.fulfillmentMode ?? 'delivery'}
          style={styles.glass}
        />

        {isPickup ? (
          <View style={styles.pickupInfo}>
            <Ionicons name="bag-handle-outline" size={20} color="#C084FC" />
            <Text style={styles.pickupInfoTxt}>
              {isPickupHost
                ? "You're the pickup host. Pay the full restaurant bill with your own card. HalfOrder holds your partner's share and releases it to reimburse you after pickup is confirmed."
                : "Pay your share securely. HalfOrder holds your payment and releases it to reimburse your partner after they pay the restaurant and confirm pickup."}
            </Text>
          </View>
        ) : null}

        {partner ? (
          <View style={styles.partnerBanner}>
            <Ionicons
              name={partnerPaid ? 'checkmark-circle' : 'time-outline'}
              size={20}
              color={partnerPaid ? '#C084FC' : '#F59E0B'}
            />
            <Text style={styles.partnerBannerTxt}>
              {isPickup
                ? isPickupHost
                  ? joinerPaid
                    ? `${partner.firstName} paid — confirm pickup after you pay the restaurant`
                    : `Waiting for ${partner.firstName} to pay their share`
                  : partnerPaid
                    ? `${partner.firstName} is the host — they'll pay at the restaurant`
                    : `Waiting for ${partner.firstName}`
                : partnerPaid
                  ? `${partner.firstName} paid — waiting for match activation`
                  : `Waiting for ${partner.firstName} to pay their share`}
            </Text>
          </View>
        ) : null}

        {isPickupHost ? (
          joinerPaid ? (
            <Pressable
              style={[styles.payBtn, confirmingPickup && styles.payBtnDisabled]}
              disabled={confirmingPickup || cancelling}
              onPress={() => void handleConfirmPickup()}
            >
              {confirmingPickup ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.payBtnTxt}>Confirm pickup & release funds</Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmTitle}>Waiting for partner payment</Text>
              <Text style={styles.confirmBody}>
                Once your partner pays, go to the restaurant, pay the full bill, then confirm pickup here to receive reimbursement.
              </Text>
            </View>
          )
        ) : phase === 'confirming' ? (
          <View style={styles.confirmBox}>
            <ActivityIndicator color={c.primary} />
            <Text style={styles.confirmTitle}>Confirming payment…</Text>
            <Text style={styles.confirmBody}>
              {isPickup
                ? 'We will open chat once your payment is held securely.'
                : 'We will open chat once both payments are confirmed.'}
            </Text>
          </View>
        ) : (
          <Pressable
            style={[styles.payBtn, phase === 'paying' && styles.payBtnDisabled]}
            disabled={phase === 'paying' || cancelling}
            onPress={() => void runPayment()}
          >
            {phase === 'paying' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                <Text style={styles.payBtnTxt}>
                  Pay {formatShareCurrency(breakdown.grandTotal)} with Stripe
                </Text>
              </>
            )}
          </Pressable>
        )}

        {canShowCancel ? (
          <Pressable
            style={[styles.cancelLink, cancelling && styles.payBtnDisabled]}
            disabled={cancelling || phase === 'paying' || confirmingPickup}
            onPress={() => void handleCancelShare()}
          >
            {cancelling ? (
              <ActivityIndicator color="#EF4444" />
            ) : (
              <Text style={styles.cancelLinkTxt}>Cancel & Go Back</Text>
            )}
          </Pressable>
        ) : null}

        <Text style={styles.secureNote}>
          {isPickup
            ? 'Pickup payments are held securely by HalfOrder and released to reimburse the host after pickup confirmation.'
            : `Amounts are calculated securely on our servers. ${Platform.OS === 'web' ? 'You will be redirected to Stripe Checkout.' : 'Payments are processed by Stripe.'}`}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.costRow}>
      <Text style={styles.costLabel}>{label}</Text>
      <Text style={styles.costValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000' },
  pad: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hint: { color: c.textSecondary, fontSize: 14 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B7BDC9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: { fontSize: 22, fontWeight: '800', color: c.white },
  foodName: { fontSize: 26, fontWeight: '900', color: '#FFF', marginTop: 4 },
  restaurant: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B7BDC9',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  hero: {
    width: '100%',
    height: 180,
    borderRadius: 20,
    marginBottom: 16,
    backgroundColor: '#1E2230',
  },
  heroPh: { opacity: 0.5 },
  glass: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pickupInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.28)',
    marginBottom: 14,
  },
  pickupInfoTxt: {
    flex: 1,
    color: '#E9D5FF',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B7BDC9',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.4,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  costLabel: { color: '#B7BDC9', fontWeight: '600' },
  costValue: { color: '#FFF', fontWeight: '800' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  totalLabel: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  totalValue: { color: '#C084FC', fontWeight: '900', fontSize: 18 },
  partnerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(23,25,35,0.92)',
    marginBottom: 16,
  },
  partnerBannerTxt: { flex: 1, color: '#FFF', fontWeight: '600', fontSize: 14 },
  payBtn: {
    height: 54,
    borderRadius: 999,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnTxt: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  cancelLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
  },
  cancelLinkTxt: { color: '#EF4444', fontWeight: '900', fontSize: 15 },
  confirmBox: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(23,25,35,0.92)',
    marginTop: 8,
  },
  confirmTitle: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  confirmBody: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  secureNote: {
    marginTop: 16,
    textAlign: 'center',
    color: '#7D8493',
    fontSize: 12,
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: c.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnTxt: { color: c.textOnPrimary, fontWeight: '700' },
  errorText: { color: '#FB7185', fontSize: 15, marginVertical: 12 },
});
