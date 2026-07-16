import { FoodShareInviteButton } from '@/components/foodShare/FoodShareInviteButton';
import { confirmCancelWaitingShare } from '@/hooks/useFoodShareUx';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import {
  FOOD_SHARE_ERRORS,
  FOOD_SHARE_SUCCESS,
  foodShareErrorMessage,
} from '@/lib/foodShareUx';
import { formatShareCurrency, buildAdminShareCostBreakdown } from '@/lib/foodSharePricing';
import {
  resolvePickupOrDeliveryLabel,
  resolveShareDateLabel,
  resolveShareTimeLabel,
} from '@/lib/foodShareInvite';
import { setPendingFoodShareInviteId } from '@/lib/foodShareInvitePending';
import { TABS_ROUTES, USER_ROUTES } from '@/lib/navigationPaths';
import { mapAdminFoodShareDoc } from '@/services/adminFoodSharesService';
import { cancelWaitingFoodShare } from '@/services/foodShareMatchService';
import { recordFoodShareInviteOpened } from '@/services/foodShareInvite';
import { joinAdminFoodShare } from '@/services/foodShareMatchService';
import { auth, db } from '@/services/firebase';
import { theme } from '@/constants/theme';
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
import { showError, showSuccess } from '@/utils/toast';
import { useSwipeStore } from '@/store/swipeStore';

const c = theme.colors;

export default function FoodShareDetailScreen() {
  const router = useRouter();
  const { adminFoodShareId, invite } = useLocalSearchParams<{
    adminFoodShareId?: string;
    invite?: string;
  }>();
  const shareId = typeof adminFoodShareId === 'string' ? adminFoodShareId.trim() : '';
  const inviteId = typeof invite === 'string' ? invite.trim() : '';
  const myUid = auth.currentUser?.uid ?? '';

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const removeSwipeCard = useSwipeStore((s) => s.removeCard);
  const [error, setError] = useState<string | null>(null);
  const [shareRaw, setShareRaw] = useState<Record<string, unknown> | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const trackedOpenRef = useRef(false);

  useEffect(() => {
    if (inviteId) setPendingFoodShareInviteId(inviteId);
  }, [inviteId]);

  useEffect(() => {
    if (!shareId) {
      setError('Missing meal share.');
      setLoading(false);
      return undefined;
    }

    const shareRef = doc(db, 'adminFoodShares', shareId);
    const unsub = onSnapshot(
      shareRef,
      (snap) => {
        if (!snap.exists()) {
          setError('This meal share is no longer available.');
          setShareRaw(null);
        } else {
          setShareRaw(snap.data() as Record<string, unknown>);
          setError(null);
        }
        setLoading(false);
      },
      (err) => {
        setError(foodShareErrorMessage(err, FOOD_SHARE_ERRORS.connectionLost));
        setLoading(false);
      },
    );
    return unsub;
  }, [shareId]);

  useEffect(() => {
    if (!myUid || !shareId) return undefined;
    const requestRef = doc(db, 'matchRequests', `${shareId}_${myUid}`);
    const unsub = onSnapshot(requestRef, (snap) => {
      if (!snap.exists()) {
        setIsWaiting(false);
        return;
      }
      const status = String(snap.data()?.status ?? '').toUpperCase();
      setIsWaiting(status === 'WAITING');
      if (status === 'MATCHED') {
        const matchId = snap.data()?.matchId;
        if (typeof matchId === 'string' && matchId.trim()) {
          router.replace(USER_ROUTES.foodSharePay(matchId.trim()) as never);
        }
      }
    });
    return unsub;
  }, [myUid, router, shareId]);

  useEffect(() => {
    if (!inviteId || trackedOpenRef.current || !myUid) return;
    trackedOpenRef.current = true;
    void recordFoodShareInviteOpened(inviteId);
  }, [inviteId, myUid]);

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

  const handleJoin = useCallback(async () => {
    if (!shareId || joining || cancelling) return;
    if (!myUid) {
      router.push(
        `/(auth)/login?redirectTo=${encodeURIComponent(USER_ROUTES.foodShare(shareId))}` as never,
      );
      return;
    }
    setJoining(true);
    try {
      const result = await joinAdminFoodShare(shareId);
      if (!result.ok) throw new Error(result.error);
      if (result.matched) {
        showSuccess(FOOD_SHARE_SUCCESS.matchFound);
        router.replace(USER_ROUTES.foodSharePay(result.matchId) as never);
      } else {
        showSuccess(FOOD_SHARE_SUCCESS.shareJoined);
        router.replace(USER_ROUTES.foodShareWaiting(shareId) as never);
      }
    } catch (e) {
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.unableToJoin));
    } finally {
      setJoining(false);
    }
  }, [cancelling, joining, myUid, router, shareId]);

  const handleCancelShare = useCallback(async () => {
    if (!shareId || !share || cancelling) return;
    const ok = await confirmCancelWaitingShare(share.foodName);
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelWaitingFoodShare(shareId);
      removeSwipeCard(shareId);
      setIsWaiting(false);
      showSuccess('Share cancelled');
      router.replace(TABS_ROUTES.swipe as never);
    } catch (e) {
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.cancelFailed));
    } finally {
      setCancelling(false);
    }
  }, [cancelling, removeSwipeCard, router, share, shareId]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(TABS_ROUTES.swipe as never);
  }, [router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeCinematicBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={c.primary} size="large" />
          <Text style={styles.hint}>Loading meal share…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !share || !breakdown || !shareRaw) {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeCinematicBackground />
        <View style={[styles.centered, styles.pad]}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.title}>Meal share unavailable</Text>
          <Text style={styles.hint}>{error ?? 'Not found.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={handleBack}>
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
        <Pressable style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>

        <Text style={styles.kicker}>Food share</Text>
        <Text style={styles.foodName}>{share.foodName}</Text>
        <Text style={styles.restaurant}>{share.restaurantName}</Text>

        {share.image ? (
          <Image source={{ uri: share.image }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPh]} />
        )}

        {share.description ? (
          <Text style={styles.description}>{share.description}</Text>
        ) : null}

        <View style={styles.glass}>
          <Text style={styles.section}>Pricing</Text>
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
          <Text style={styles.section}>Schedule</Text>
          <CostRow label="Pickup / Delivery" value={schedule.pickupOrDelivery} />
          <CostRow label="Date" value={schedule.dateLabel} />
          <CostRow label="Time" value={schedule.timeLabel} />
        </View>

        {isWaiting ? (
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
          style={[styles.primaryBtn, joining && styles.btnDisabled]}
          onPress={() => void handleJoin()}
          disabled={joining || cancelling}
        >
          {joining ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {isWaiting ? 'View waiting status' : 'Join this food share'}
            </Text>
          )}
        </Pressable>

        {isWaiting ? (
          <Pressable
            style={[styles.cancelBtn, cancelling && styles.btnDisabled]}
            onPress={() => void handleCancelShare()}
            disabled={cancelling || joining}
          >
            {cancelling ? (
              <ActivityIndicator color="#EF4444" />
            ) : (
              <Text style={styles.cancelBtnText}>Cancel Share</Text>
            )}
          </Pressable>
        ) : null}

        {!isWaiting ? (
          <Text style={styles.infoNote}>
            Split this meal with another foodie nearby. Like the card to join the wait list or
            match instantly when a partner is ready.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CostRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.costRow}>
      <Text style={styles.costLabel}>{label}</Text>
      <Text style={[styles.costValue, bold && styles.costValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#09090B' },
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
    color: '#B7BDC9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: { fontSize: 22, fontWeight: '800', color: c.white, textAlign: 'center' },
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
    height: 200,
    borderRadius: 20,
    marginBottom: 14,
    backgroundColor: '#1E2230',
  },
  heroPh: { opacity: 0.5 },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 14,
  },
  glass: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  costLabel: { fontSize: 14, color: '#B7BDC9', flex: 1 },
  costValue: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  costValueBold: { fontSize: 16, fontWeight: '900' },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
  infoNote: {
    fontSize: 13,
    lineHeight: 20,
    color: '#B7BDC9',
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: 'rgba(239,68,68,0.14)',
  },
  cancelBtnText: { color: '#EF4444', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
});
