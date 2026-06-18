import { FoodShareInviteButton } from '@/components/foodShare/FoodShareInviteButton';
import { confirmCancelWaitingShare } from '@/hooks/useFoodShareUx';
import { formatShareCurrency, buildAdminShareCostBreakdown } from '@/lib/foodSharePricing';
import {
  resolvePickupOrDeliveryLabel,
  resolveShareDateLabel,
  resolveShareTimeLabel,
} from '@/lib/foodShareInvite';
import {
  FOOD_SHARE_ERRORS,
  FOOD_SHARE_SUCCESS,
  foodShareErrorMessage,
} from '@/lib/foodShareUx';
import { TABS_ROUTES, USER_ROUTES } from '@/lib/navigationPaths';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { mapAdminFoodShareDoc } from '@/services/adminFoodSharesService';
import { cancelWaitingFoodShare } from '@/services/foodShareMatchService';
import { auth, db } from '@/services/firebase';
import { theme } from '@/constants/theme';
import type { MatchRequestStatus } from '@/types/foodShare';
import { safeToMillis } from '@/utils/safeToMillis';
import { showError, showSuccess } from '@/utils/toast';
import { useSwipeStore } from '@/store/swipeStore';
import { formatFirestoreTime } from '@/lib/admin/orderHelpers';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const c = theme.colors;

type Phase = 'loading' | 'waiting' | 'matched' | 'cancelled' | 'error';

export default function FoodShareWaitingScreen() {
  const router = useRouter();
  const { adminFoodShareId } = useLocalSearchParams<{ adminFoodShareId?: string }>();
  const shareId = typeof adminFoodShareId === 'string' ? adminFoodShareId.trim() : '';
  const myUid = auth.currentUser?.uid ?? '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [requestStatus, setRequestStatus] = useState<MatchRequestStatus | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [joinedAtLabel, setJoinedAtLabel] = useState('—');
  const [shareRaw, setShareRaw] = useState<Record<string, unknown> | null>(null);
  const removeSwipeCard = useSwipeStore((s) => s.removeCard);
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!shareId || !myUid) {
      setPhase('error');
      setError(myUid ? 'Missing meal share.' : FOOD_SHARE_ERRORS.signInRequired);
      return undefined;
    }

    console.log('[MATCH FLOW STEP]', {
      step: 'waiting_screen_open',
      adminFoodShareId: shareId,
      userId: myUid,
    });

    const shareRef = doc(db, 'adminFoodShares', shareId);
    const requestRef = doc(db, 'matchRequests', `${shareId}_${myUid}`);

    const unsubShare = onSnapshot(
      shareRef,
      (snap) => {
        if (!snap.exists()) {
          setError('This meal share is no longer available.');
          setPhase('error');
          return;
        }
        setShareRaw(snap.data() as Record<string, unknown>);
      },
      (err) => {
        setError(foodShareErrorMessage(err, FOOD_SHARE_ERRORS.connectionLost));
        setPhase('error');
      },
    );

    const unsubRequest = onSnapshot(
      requestRef,
      (snap) => {
        if (!snap.exists()) {
          setError('Join request not found.');
          setPhase('error');
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const statusRaw = String(data.status ?? 'WAITING').toUpperCase();
        const status: MatchRequestStatus =
          statusRaw === 'MATCHED' || statusRaw === 'CANCELLED'
            ? statusRaw
            : 'WAITING';
        const nextMatchId =
          typeof data.matchId === 'string' && data.matchId.trim()
            ? data.matchId.trim()
            : null;
        const joinedMs = safeToMillis(data.createdAt);

        setRequestStatus(status);
        setMatchId(nextMatchId);
        setJoinedAtLabel(joinedMs ? formatFirestoreTime(joinedMs) : '—');
        setError(null);

        if (status === 'MATCHED' && nextMatchId) {
          setPhase('matched');
          if (!navigatedRef.current) {
            navigatedRef.current = true;
            console.log('[MATCH FOUND]', {
              matchId: nextMatchId,
              adminFoodShareId: shareId,
              trigger: 'matchRequest_listener',
            });
            console.log('[PAYMENT START]', {
              route: USER_ROUTES.foodSharePay(nextMatchId),
              matchId: nextMatchId,
              from: 'waiting_screen',
            });
            router.replace(USER_ROUTES.foodSharePay(nextMatchId) as never);
          }
          return;
        }

        if (status === 'CANCELLED') {
          setPhase('cancelled');
          return;
        }

        setPhase('waiting');
      },
      (err) => {
        setError(foodShareErrorMessage(err, FOOD_SHARE_ERRORS.connectionLost));
        setPhase('error');
      },
    );

    return () => {
      unsubShare();
      unsubRequest();
    };
  }, [myUid, router, shareId]);

  const share = useMemo(
    () => (shareRaw && shareId ? mapAdminFoodShareDoc(shareId, shareRaw) : null),
    [shareId, shareRaw],
  );

  const breakdown = useMemo(() => {
    if (!share) return null;
    return buildAdminShareCostBreakdown(
      share.originalPrice,
      share.sharedPrice,
      share.deliveryShare,
    );
  }, [share]);

  const schedule = useMemo(() => {
    if (!shareRaw) {
      return { pickupOrDelivery: '—', dateLabel: '—', timeLabel: '—' };
    }
    return {
      pickupOrDelivery: resolvePickupOrDeliveryLabel(shareRaw),
      dateLabel: resolveShareDateLabel(shareRaw),
      timeLabel: resolveShareTimeLabel(shareRaw),
    };
  }, [shareRaw]);

  const handleBackToSwipe = useCallback(() => {
    router.replace(TABS_ROUTES.swipe as never);
  }, [router]);

  const handleCancel = useCallback(async () => {
    if (!shareId || !share || cancelling) return;
    const ok = await confirmCancelWaitingShare(share.foodName);
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelWaitingFoodShare(shareId);
      removeSwipeCard(shareId);
      showSuccess('Request cancelled');
      router.replace(TABS_ROUTES.swipe as never);
    } catch (e) {
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.unableToJoin));
    } finally {
      setCancelling(false);
    }
  }, [cancelling, removeSwipeCard, router, share, shareId]);

  if (phase === 'loading' || (phase === 'matched' && !error)) {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeCinematicBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={c.primary} size="large" />
          <Text style={styles.hint}>
            {phase === 'matched' ? 'Partner found — opening payment…' : 'Loading…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'error' || !share || !breakdown) {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeCinematicBackground />
        <View style={[styles.centered, styles.pad]}>
          <Ionicons name="alert-circle-outline" size={40} color="#F87171" />
          <Text style={styles.title}>Unable to load</Text>
          <Text style={styles.hint}>{error ?? 'Meal share not found.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={handleBackToSwipe}>
            <Text style={styles.primaryBtnText}>Back to Swipe</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'cancelled') {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeCinematicBackground />
        <View style={[styles.centered, styles.pad]}>
          <Ionicons name="close-circle-outline" size={40} color="rgba(255,255,255,0.5)" />
          <Text style={styles.title}>Request cancelled</Text>
          <Text style={styles.hint}>You are no longer waiting for a partner on this meal.</Text>
          <Pressable style={styles.primaryBtn} onPress={handleBackToSwipe}>
            <Text style={styles.primaryBtnText}>Back to Swipe</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SwipeCinematicBackground />
      <ScrollView contentContainerStyle={styles.pad}>
        <Pressable style={styles.backBtn} onPress={handleBackToSwipe}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>

        <Text style={styles.kicker}>Waiting for partner</Text>
        <Text style={styles.foodName}>{share.foodName}</Text>
        <Text style={styles.restaurant}>{share.restaurantName}</Text>

        {share.image ? (
          <Image source={{ uri: share.image }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPh]} />
        )}

        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            {requestStatus === 'WAITING' ? 'Waiting for a partner' : requestStatus ?? 'Waiting'}
          </Text>
        </View>

        <View style={styles.glass}>
          <Text style={styles.section}>Your share</Text>
          <CostRow label="Food share" value={formatShareCurrency(breakdown.sharedPrice)} />
          <CostRow label="Delivery share" value={formatShareCurrency(breakdown.deliveryShare)} />
          <View style={styles.divider} />
          <CostRow
            label="Total per person"
            value={formatShareCurrency(breakdown.totalPerUser)}
            bold
          />
        </View>

        <View style={styles.glass}>
          <Text style={styles.section}>Details</Text>
          <CostRow label="Joined" value={joinedAtLabel} />
          <CostRow label="Status" value="Waiting for partner" />
          {matchId ? <CostRow label="Match ID" value={matchId} mono /> : null}
        </View>

        <Text style={styles.infoNote}>
          {FOOD_SHARE_SUCCESS.shareJoined} We will notify you when someone joins this meal share.
        </Text>

        {shareRaw ? (
          <FoodShareInviteButton
            adminFoodShareId={shareId}
            shareRaw={shareRaw}
            foodName={share.foodName}
            restaurantName={share.restaurantName}
            sharedPrice={breakdown.sharedPrice}
            deliveryShare={breakdown.deliveryShare}
            totalPerUser={breakdown.totalPerUser}
            pickupOrDelivery={schedule.pickupOrDelivery}
            dateLabel={schedule.dateLabel}
            timeLabel={schedule.timeLabel}
          />
        ) : null}

        <Pressable
          style={[styles.outlineBtn, cancelling && styles.btnDisabled]}
          onPress={() => void handleCancel()}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.outlineBtnText}>Cancel Share</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryBtn} onPress={handleBackToSwipe}>
          <Text style={styles.secondaryBtnText}>Back to Swipe</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function CostRow({
  label,
  value,
  bold,
  mono,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={styles.costRow}>
      <Text style={styles.costLabel}>{label}</Text>
      <Text
        style={[
          styles.costValue,
          bold && styles.costValueBold,
          mono && styles.costMono,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#06080C' },
  pad: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hint: { color: c.textSecondary, fontSize: 14, textAlign: 'center' },
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
  title: { fontSize: 22, fontWeight: '800', color: c.white, textAlign: 'center' },
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
    height: 180,
    borderRadius: 20,
    marginBottom: 16,
    backgroundColor: '#1a2030',
  },
  heroPh: { opacity: 0.5 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FBBF24',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FDE68A',
  },
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
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  costLabel: { fontSize: 14, color: 'rgba(255,255,255,0.65)', flex: 1 },
  costValue: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  costValueBold: { fontSize: 16, fontWeight: '900' },
  costMono: { fontSize: 11, fontFamily: 'monospace' },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
  infoNote: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  outlineBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  outlineBtnText: { color: '#FCA5A5', fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  secondaryBtnText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
