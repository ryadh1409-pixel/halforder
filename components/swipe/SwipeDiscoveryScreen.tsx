import { USER_ROUTES } from '@/lib/navigationPaths';
import { formatShareCurrency } from '@/lib/foodSharePricing';
import type { FoodShareFulfillmentMode } from '@/lib/foodShareFulfillment';
import {
  FOOD_SHARE_ERRORS,
  FOOD_SHARE_SUCCESS,
  foodShareErrorMessage,
} from '@/lib/foodShareUx';
import { hapticMatchFound, hapticShareJoined } from '@/lib/foodShareHaptics';
import { FoodShareNotificationBell } from '@/components/foodShare/FoodShareNotificationBell';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SwipeActionButtons } from '@/components/swipe/SwipeActionButtons';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { SwipeDeck } from '@/components/swipe/SwipeDeck';
import { SwipeMatchSheet } from '@/components/swipe/SwipeMatchSheet';
import {
  adminFoodSharesToSwipeCards,
  subscribeActiveAdminFoodShares,
  subscribeSwipeMatchQueues,
} from '@/services/adminFoodSharesService';
import { joinAdminFoodShare } from '@/services/foodShareMatchService';
import { auth } from '@/services/firebase';
import {
  findLivePromoForCard,
  subscribeLiveSwipeReferralPromotions,
} from '@/services/swipeReferralPromotion';
import { recordSwipe } from '@/services/swipeService';
import { useSwipeStore } from '@/store/swipeStore';
import type { SwipeReferralPromotion } from '@/types/swipeReferralPromotion';
import type { AdminFoodShareDoc } from '@/types/foodShare';
import type { SwipeQueueMarketplaceState } from '@/lib/swipeMarketplaceStatus';
import { isSwipeMarketplaceJoinLocked } from '@/lib/swipeMarketplaceStatus';
import { showError, showSuccess } from '@/utils/toast';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');

async function resolveMyFirstName(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return 'You';
  const name =
    user.displayName?.trim() ||
    (typeof user.email === 'string' ? user.email.split('@')[0] : '') ||
    'You';
  return name.split(/\s+/)[0] ?? name;
}

/**
 * Admin-controlled meal-share matching — 10 active cards from `adminFoodShares`.
 * Delivery deck is unchanged; Pickup is an additive filtered section.
 */
export function SwipeDiscoveryScreen() {
  const router = useRouter();
  const [fulfillmentMode, setFulfillmentMode] =
    useState<FoodShareFulfillmentMode>('delivery');
  const [actionSignal, setActionSignal] = useState<{
    id: number;
    direction: 'like' | 'pass';
  } | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(true);
  const [liveReferralPromos, setLiveReferralPromos] = useState<
    SwipeReferralPromotion[]
  >([]);
  const deckIndex = useSwipeStore((s) => s.deckIndex);
  const cards = useSwipeStore((s) => s.cards);
  const joiningOrderId = useSwipeStore((s) => s.joiningOrderId);
  const lastMatch = useSwipeStore((s) => s.lastMatch);
  const setCards = useSwipeStore((s) => s.setCards);
  const setDeckIndex = useSwipeStore((s) => s.setDeckIndex);
  const advanceDeck = useSwipeStore((s) => s.advanceDeck);
  const setJoining = useSwipeStore((s) => s.setJoining);
  const setLastMatch = useSwipeStore((s) => s.setLastMatch);
  const sharesRef = useRef<AdminFoodShareDoc[]>([]);
  const queuesRef = useRef<Record<string, SwipeQueueMarketplaceState>>({});

  const rebuildDeck = useCallback(() => {
    const result = adminFoodSharesToSwipeCards(
      sharesRef.current,
      queuesRef.current,
    );
    setCards(result);
    setLoadingDeck(false);
  }, [setCards]);

  useEffect(() => {
    const unsubShares = subscribeActiveAdminFoodShares((shares) => {
      sharesRef.current = shares;
      rebuildDeck();
    });
    const unsubQueues = subscribeSwipeMatchQueues((queues) => {
      queuesRef.current = queues;
      rebuildDeck();
    });
    return () => {
      unsubShares();
      unsubQueues();
    };
  }, [rebuildDeck]);

  useEffect(() => {
    return subscribeLiveSwipeReferralPromotions(setLiveReferralPromos);
  }, []);

  const cardsWithReferral = useMemo(() => {
    if (liveReferralPromos.length === 0) return cards;
    return cards.map((card) => {
      if (card.fulfillmentMode !== 'delivery') {
        return { ...card, referralRewardLabel: null };
      }
      const promo = findLivePromoForCard(
        liveReferralPromos,
        card.adminFoodShareId,
      );
      return {
        ...card,
        referralRewardLabel: promo?.badgeText ?? null,
      };
    });
  }, [cards, liveReferralPromos]);

  const filteredCards = useMemo(
    () =>
      cardsWithReferral.filter(
        (card) => card.fulfillmentMode === fulfillmentMode,
      ),
    [cardsWithReferral, fulfillmentMode],
  );

  const current = filteredCards[deckIndex];
  const next = filteredCards[deckIndex + 1];
  const cardMaxH = useMemo(() => Math.min(SCREEN_H * 0.52, 500), []);

  const selectMode = useCallback(
    (mode: FoodShareFulfillmentMode) => {
      if (mode === fulfillmentMode) return;
      setFulfillmentMode(mode);
      setDeckIndex(0);
      setActionSignal(null);
    },
    [fulfillmentMode, setDeckIndex],
  );

  const handlePass = useCallback(async () => {
    if (!current) return;
    void Haptics.selectionAsync();
    void recordSwipe({
      orderId: current.adminFoodShareId,
      foodId: current.adminFoodShareId,
      restaurantId: current.restaurantId,
      direction: 'pass',
    });
    advanceDeck();
  }, [advanceDeck, current]);

  const handleLike = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      router.push('/(auth)/login?redirectTo=/(tabs)/swipe' as never);
      return;
    }
    if (!current || joiningOrderId) return;
    if (isSwipeMarketplaceJoinLocked(current.marketplaceStatus)) {
      showSuccess(
        current.marketplaceStatus === 'ready'
          ? 'Ready for Restaurant'
          : 'Matched',
      );
      return;
    }

    setJoining(current.id);
    void recordSwipe({
      orderId: current.adminFoodShareId,
      foodId: current.adminFoodShareId,
      restaurantId: current.restaurantId,
      direction: 'like',
    });

    try {
      const result = await joinAdminFoodShare(current.adminFoodShareId);
      if (!result.ok) throw new Error(result.error);

      console.log('[MATCH FLOW STEP]', {
        step: 'joinAdminFoodShare_result',
        matched: result.matched,
        adminFoodShareId: result.adminFoodShareId,
        matchId: result.matched ? result.matchId : null,
      });

      if (result.matched) {
        console.log('[MATCH FOUND]', {
          matchId: result.matchId,
          partnerUid: result.partnerUid,
          adminFoodShareId: result.adminFoodShareId,
        });
        const myFirstName = await resolveMyFirstName();
        setLastMatch({
          matchId: result.matchId,
          adminFoodShareId: result.adminFoodShareId,
          matchChatId: result.matchChatId,
          foodTitle: current.title,
          restaurantName: current.restaurantName,
          partnerUid: result.partnerUid,
          partnerFirstName: result.partnerFirstName,
          myFirstName,
          costBreakdown: result.costBreakdown,
        });
        hapticMatchFound();
        showSuccess(FOOD_SHARE_SUCCESS.matchFound);
        console.log('[PAYMENT START]', {
          route: USER_ROUTES.foodSharePay(result.matchId),
          matchId: result.matchId,
        });
        router.push(USER_ROUTES.foodSharePay(result.matchId) as never);
        advanceDeck();
      } else {
        console.log('[MATCH FLOW STEP]', {
          step: 'navigate_to_waiting_screen',
          adminFoodShareId: result.adminFoodShareId,
        });
        hapticShareJoined();
        showSuccess(FOOD_SHARE_SUCCESS.shareJoined);
        advanceDeck();
        router.push(USER_ROUTES.foodShareWaiting(result.adminFoodShareId) as never);
      }
    } catch (e) {
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.unableToJoin));
    } finally {
      setJoining(null);
    }
  }, [advanceDeck, current, joiningOrderId, router, setJoining, setLastMatch]);

  const isPickup = fulfillmentMode === 'pickup';
  const splitLabel = lastMatch
    ? isPickup
      ? `${formatShareCurrency(lastMatch.costBreakdown.totalPerUser)} each (${formatShareCurrency(lastMatch.costBreakdown.sharedPrice)} food + free pickup)`
      : `${formatShareCurrency(lastMatch.costBreakdown.totalPerUser)} each (${formatShareCurrency(lastMatch.costBreakdown.sharedPrice)} food + ${formatShareCurrency(lastMatch.costBreakdown.deliveryShare)} delivery)`
    : '';

  return (
    <GestureHandlerRootView style={styles.root}>
      <SwipeCinematicBackground />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Ionicons name="flame" size={22} color="#A855F7" />
          <Text style={styles.headerTitle}>Swipe</Text>
          <FoodShareNotificationBell />
          <Text style={styles.headerSub}>
            Share half the food. Save half the money.
          </Text>
        </View>

        <View style={styles.modeRow}>
          <Pressable
            style={[
              styles.modeChip,
              fulfillmentMode === 'delivery' && styles.modeChipActive,
            ]}
            onPress={() => selectMode('delivery')}
            accessibilityRole="button"
            accessibilityState={{ selected: fulfillmentMode === 'delivery' }}
          >
            <Text
              style={[
                styles.modeChipTxt,
                fulfillmentMode === 'delivery' && styles.modeChipTxtActive,
              ]}
            >
              🚚 Delivery
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeChip,
              fulfillmentMode === 'pickup' && styles.modeChipActive,
            ]}
            onPress={() => selectMode('pickup')}
            accessibilityRole="button"
            accessibilityState={{ selected: fulfillmentMode === 'pickup' }}
          >
            <Text
              style={[
                styles.modeChipTxt,
                fulfillmentMode === 'pickup' && styles.modeChipTxtActive,
              ]}
            >
              🛍️ Pickup
            </Text>
          </Pressable>
        </View>

        <SwipeDeck
          current={current}
          next={next}
          cardMaxHeight={cardMaxH}
          loading={loadingDeck}
          actionSignal={actionSignal ?? undefined}
          onPass={() => void handlePass()}
          onLike={() => void handleLike()}
        />

        {!loadingDeck && filteredCards.length === 0 ? (
          <Text style={styles.empty}>
            {isPickup
              ? 'No active pickup shares yet. An admin must activate pickup cards first.'
              : 'No active meal shares yet. An admin must activate cards first.'}
          </Text>
        ) : null}

        <SwipeActionButtons
          disabled={!current}
          likeDisabled={
            current != null &&
            isSwipeMarketplaceJoinLocked(current.marketplaceStatus)
          }
          loading={!!joiningOrderId}
          onPass={() => setActionSignal({ id: Date.now(), direction: 'pass' })}
          onLike={() => setActionSignal({ id: Date.now(), direction: 'like' })}
        />
      </SafeAreaView>

      <SwipeMatchSheet
        visible={lastMatch != null}
        foodTitle={lastMatch?.foodTitle ?? ''}
        restaurantName={lastMatch?.restaurantName ?? ''}
        partnerFirstName={lastMatch?.partnerFirstName ?? 'Partner'}
        myFirstName={lastMatch?.myFirstName ?? 'You'}
        splitLabel={splitLabel}
        onChat={() => {
          if (lastMatch) {
            router.push(USER_ROUTES.foodSharePay(lastMatch.matchId) as never);
          }
          setLastMatch(null);
        }}
        onMatchDetails={() => {
          if (lastMatch) {
            router.push(USER_ROUTES.foodShareMatch(lastMatch.matchId) as never);
          }
          setLastMatch(null);
        }}
        onDismiss={() => setLastMatch(null)}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.3,
    flex: 1,
  },
  headerSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B7BDC9',
    flexBasis: '100%',
    marginLeft: 30,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modeChipActive: {
    backgroundColor: 'rgba(168,85,247,0.22)',
    borderColor: 'rgba(168,85,247,0.55)',
  },
  modeChipTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B7BDC9',
  },
  modeChipTxtActive: {
    color: '#FFFFFF',
  },
  empty: {
    textAlign: 'center',
    color: '#B7BDC9',
    paddingHorizontal: 28,
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
});
