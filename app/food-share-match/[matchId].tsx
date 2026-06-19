import { USER_ROUTES } from '@/lib/navigationPaths';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { orderRoomHref } from '@/services/orderChat';
import {
  confirmBlockUser,
  confirmCancelMatch,
  useFoodShareMatchLifecycleAlerts,
} from '@/hooks/useFoodShareUx';
import {
  foodShareLifecycleIndex,
  foodShareLifecycleLabel,
  FOOD_SHARE_LIFECYCLE_STEPS,
} from '@/lib/foodShareLifecycle';
import { formatShareCurrency } from '@/lib/foodSharePricing';
import { FOOD_SHARE_ERRORS, FOOD_SHARE_SUCCESS, foodShareErrorMessage } from '@/lib/foodShareUx';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { FoodShareReportModal } from '@/components/foodShare/FoodShareReportModal';
import {
  blockFoodShareUser,
  cancelFoodShareMatch,
  canCancelFoodShareMatch,
  mapMatchDoc,
  reportFoodShareUser,
} from '@/services/foodShareMatchService';
import { auth, db } from '@/services/firebase';
import { useBlock } from '@/hooks/useBlock';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showError, showSuccess } from '@/utils/toast';

const c = theme.colors;

export default function FoodShareMatchScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const id = typeof matchId === 'string' ? matchId : '';
  const myUid = auth.currentUser?.uid ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<ReturnType<typeof mapMatchDoc> | null>(
    null,
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing match.');
      return undefined;
    }
    const ref = doc(db, 'matches', id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError('Match not found.');
          setMatch(null);
        } else {
          setError(null);
          setMatch(mapMatchDoc(snap.id, snap.data() as Record<string, unknown>));
        }
        setLoading(false);
      },
      (err) => {
        setError(foodShareErrorMessage(err, FOOD_SHARE_ERRORS.connectionLost));
        setLoading(false);
      },
    );
    return unsub;
  }, [id]);

  const partner = useMemo(() => {
    if (!match || !myUid) return null;
    if (match.userA.uid === myUid) return match.userB;
    if (match.userB.uid === myUid) return match.userA;
    return match.userA;
  }, [match, myUid]);

  const { isHiddenFromMe } = useBlock();

  const lifecycleIdx = foodShareLifecycleIndex(match?.lifecycle);
  useFoodShareMatchLifecycleAlerts(match);

  useEffect(() => {
    if (match?.status === 'CANCELLED' || match?.lifecycle === 'CANCELLED') {
      setError('This match was cancelled.');
    }
  }, [match?.lifecycle, match?.status]);

  const myPaymentStatus = match?.userPayments[myUid]?.paymentStatus;
  const needsPayment =
    match?.lifecycle === 'WAITING_FOR_PAYMENT' ||
    match?.lifecycle === 'WAITING_FOR_PAYMENT_CONFIRMATION' ||
    match?.lifecycle === 'PAYMENT_CONFIRMED' ||
    match?.status === 'pending_payment';
  const canChat =
    !!match &&
    match.status !== 'CANCELLED' &&
    match.lifecycle !== 'CANCELLED' &&
    !isHiddenFromMe(partner?.uid ?? '');
  const assignedDriverId = match?.driverId || match?.assignedDriverId || '';
  const driverChatOrderId = match?.orderId || id;
  const canDriverChat = !!assignedDriverId && !!driverChatOrderId;
  const allowCancel =
    !!match &&
    match.status !== 'CANCELLED' &&
    (
      match.lifecycle === 'WAITING_FOR_PARTNER' ||
      match.lifecycle === 'WAITING_FOR_PAYMENT' ||
      match.lifecycle === 'WAITING_FOR_PAYMENT_CONFIRMATION'
    ) &&
    canCancelFoodShareMatch(match.lifecycle, match.orderStatus);
  const anyPaymentCompleted = match
    ? Object.values(match.userPayments).some((payment) => payment.paymentStatus === 'PAID')
    : false;

  const handlePay = () => {
    if (!id) return;
    router.push(USER_ROUTES.foodSharePay(id) as never);
  };

  const handleChat = () => {
    if (!id) return;
    router.push(USER_ROUTES.foodShareChat(id) as never);
  };

  const handleDriverChat = () => {
    if (!driverChatOrderId || !canDriverChat) return;
    router.push(orderRoomHref(driverChatOrderId, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never);
  };

  const handleCancel = () => {
    if (!match || !allowCancel || cancelling) return;
    if (match.lifecycle === 'WAITING_FOR_PAYMENT_CONFIRMATION' && anyPaymentCompleted) {
      showError('Payment already submitted and cannot be cancelled from the app.');
      return;
    }
    void (async () => {
      const ok = await confirmCancelMatch(match.foodName);
      if (!ok || !partner) return;
      setCancelling(true);
      try {
        const myFirstName =
          match.userA.uid === myUid
            ? match.userA.firstName
            : match.userB.firstName;
        const result = await cancelFoodShareMatch({
          matchId: id,
          partnerUid: partner.uid,
          cancelledByFirstName: myFirstName,
          foodName: match.foodName,
          adminFoodShareId: match.adminFoodShareId,
        });
        showSuccess(
          result.refundAttempted
            ? 'Match cancelled. Refund is processing.'
            : 'Match cancelled',
        );
        router.replace('/(tabs)/swipe' as never);
      } catch (e) {
        showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.cancelFailed));
      } finally {
        setCancelling(false);
      }
    })();
  };

  const handleReport = () => {
    if (!partner) return;
    setReportOpen(true);
  };

  const handleBlock = () => {
    if (!partner || !match) return;
    void (async () => {
      const ok = await confirmBlockUser(partner.firstName);
      if (!ok) return;
      try {
        const myFirstName =
          match.userA.uid === myUid
            ? match.userA.firstName
            : match.userB.firstName;
        await blockFoodShareUser({
          blockedUid: partner.uid,
          matchId: id,
          blockerFirstName: myFirstName,
          foodName: match.foodName,
          adminFoodShareId: match.adminFoodShareId,
        });
        showSuccess(FOOD_SHARE_SUCCESS.userBlocked);
        router.back();
      } catch (e) {
        showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.blockFailed));
      }
    })();
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.sheetDark }]}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={styles.hint}>Loading match…</Text>
      </View>
    );
  }

  if (error || !match) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.pad}>
          <Text style={styles.title}>Match</Text>
          <Text style={styles.errorText}>{error ?? 'Match not found.'}</Text>
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

        <Text style={styles.kicker}>Meal share match</Text>
        <Text style={styles.foodName}>{match.foodName}</Text>
        <Text style={styles.restaurant}>{match.restaurantName}</Text>

        {match.foodImageUrl ? (
          <Image source={{ uri: match.foodImageUrl }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPh]} />
        )}

        <Glass>
          <Text style={styles.section}>Matched users</Text>
          <UserRow label="User 1" name={match.userA.firstName} isYou={match.userA.uid === myUid} />
          <UserRow label="User 2" name={match.userB.firstName} isYou={match.userB.uid === myUid} />
        </Glass>

        <Glass>
          <Text style={styles.section}>Status</Text>
          <StatusRow label="Order status" value={match.orderStatus ?? 'Pending'} />
          <View style={styles.timeline}>
            {FOOD_SHARE_LIFECYCLE_STEPS.map((step, index) => {
              const active = index <= lifecycleIdx;
              return (
                <View key={step} style={styles.stepRow}>
                  <View style={[styles.stepDot, active && styles.stepDotActive]} />
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>
                    {foodShareLifecycleLabel(step)}
                  </Text>
                </View>
              );
            })}
          </View>
        </Glass>

        <Glass>
          <Text style={styles.section}>Shared cost breakdown</Text>
          <CostRow label="Original meal price" value={formatShareCurrency(breakdown.originalPrice)} />
          <CostRow label="Your shared food cost" value={formatShareCurrency(breakdown.sharedPrice)} />
          <CostRow label="Your shared delivery cost" value={formatShareCurrency(breakdown.deliveryShare)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>You pay</Text>
            <Text style={styles.totalValue}>{formatShareCurrency(breakdown.totalPerUser)}</Text>
          </View>
        </Glass>

        <Pressable
          style={styles.actionPrimary}
          onPress={needsPayment && myPaymentStatus !== 'PAID' ? handlePay : handleChat}
        >
          <Ionicons
            name={canChat ? 'chatbubbles' : 'card-outline'}
            size={20}
            color="#0A0A0A"
          />
          <Text style={styles.actionPrimaryTxt}>
            {canChat
              ? `Partner Chat · ${partner?.firstName ?? 'partner'}`
              : myPaymentStatus === 'PAID'
                ? 'Waiting for partner payment'
                : `Pay ${formatShareCurrency(breakdown.totalPerUser)}`}
          </Text>
        </Pressable>
        {canDriverChat ? (
          <Pressable style={styles.actionSecondary} onPress={handleDriverChat}>
            <Ionicons name="car-outline" size={18} color="#FFF" />
            <Text style={styles.actionSecondaryTxt}>Driver Chat</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.actionDangerOutline, (!allowCancel || cancelling) && styles.actionDisabled]}
          onPress={handleCancel}
          disabled={!allowCancel || cancelling}
        >
          <Text style={styles.actionDangerOutlineTxt}>
            {cancelling
              ? 'Cancelling…'
              : allowCancel
                ? 'Cancel Share'
                : 'Cannot cancel after order placed'}
          </Text>
        </Pressable>
        <Pressable style={styles.actionSecondary} onPress={handleReport}>
          <Text style={styles.actionSecondaryTxt}>Report user</Text>
        </Pressable>
        <Pressable style={styles.actionDanger} onPress={handleBlock}>
          <Text style={styles.actionDangerTxt}>Block user</Text>
        </Pressable>

        <FoodShareReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          reportedFirstName={partner?.firstName}
          onSubmit={async ({ reason, description }) => {
            if (!partner) return;
            await reportFoodShareUser({
              reportedUid: partner.uid,
              matchId: id,
              reason,
              description,
            });
            showSuccess(FOOD_SHARE_SUCCESS.reportSubmitted);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Glass({ children }: { children: React.ReactNode }) {
  return <View style={styles.glass}>{children}</View>;
}

function UserRow({
  label,
  name,
  isYou,
}: {
  label: string;
  name: string;
  isYou: boolean;
}) {
  return (
    <View style={styles.userRow}>
      <Text style={styles.userLabel}>{label}</Text>
      <Text style={styles.userName}>
        {name}
        {isYou ? ' (You)' : ''}
      </Text>
    </View>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
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
  safe: { flex: 1, backgroundColor: '#06080C' },
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
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: { fontSize: 22, fontWeight: '800', color: c.white },
  foodName: { fontSize: 26, fontWeight: '900', color: '#FFF', marginTop: 4 },
  restaurant: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  hero: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    marginBottom: 16,
    backgroundColor: '#1a2030',
  },
  heroPh: { opacity: 0.5 },
  glass: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.4,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  userLabel: { color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  userName: { color: '#FFF', fontWeight: '800' },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statusLabel: { color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  statusValue: { color: '#7DFFB8', fontWeight: '800' },
  timeline: { marginTop: 10, gap: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  stepDotActive: { backgroundColor: '#06C167' },
  stepLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
  stepLabelActive: { color: '#FFF' },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  costLabel: { color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
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
  totalValue: { color: '#7DFFB8', fontWeight: '900', fontSize: 18 },
  actionPrimary: {
    marginTop: 8,
    height: 52,
    borderRadius: 999,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionPrimaryTxt: { color: '#0A0A0A', fontWeight: '900', fontSize: 16 },
  actionSecondary: {
    marginTop: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  actionSecondaryTxt: { color: '#FFF', fontWeight: '800' },
  actionDisabled: { opacity: 0.45 },
  actionDangerOutline: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F87171',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  actionDangerOutlineTxt: { color: '#F87171', fontWeight: '900' },
  actionDanger: { marginTop: 10, paddingVertical: 14, alignItems: 'center' },
  actionDangerTxt: { color: '#FB7185', fontWeight: '800' },
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
