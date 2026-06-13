import { USER_ROUTES } from '@/lib/navigationPaths';
import { formatShareCurrency } from '@/lib/foodSharePricing';
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
} from '@/services/adminFoodSharesService';
import { joinAdminFoodShare } from '@/services/foodShareMatchService';
import { auth } from '@/services/firebase';
import { recordSwipe } from '@/services/swipeService';
import { useSwipeStore } from '@/store/swipeStore';
import { showError, showNotice, showSuccess } from '@/utils/toast';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
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
 */
export function SwipeDiscoveryScreen() {
  const router = useRouter();
  const [actionSignal, setActionSignal] = useState<{
    id: number;
    direction: 'like' | 'pass';
  } | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(true);
  const deckIndex = useSwipeStore((s) => s.deckIndex);
  const cards = useSwipeStore((s) => s.cards);
  const joiningOrderId = useSwipeStore((s) => s.joiningOrderId);
  const lastMatch = useSwipeStore((s) => s.lastMatch);
  const setCards = useSwipeStore((s) => s.setCards);
  const advanceDeck = useSwipeStore((s) => s.advanceDeck);
  const setJoining = useSwipeStore((s) => s.setJoining);
  const setLastMatch = useSwipeStore((s) => s.setLastMatch);

  useEffect(() => {
    const unsub = subscribeActiveAdminFoodShares((shares) => {
      setCards(adminFoodSharesToSwipeCards(shares));
      setLoadingDeck(false);
    });
    return unsub;
  }, [setCards]);

  const current = cards[deckIndex];
  const next = cards[deckIndex + 1];
  const cardMaxH = useMemo(() => Math.min(SCREEN_H * 0.52, 500), []);

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

      if (result.matched) {
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
        router.push(USER_ROUTES.foodSharePay(result.matchId) as never);
        advanceDeck();
      } else {
        hapticShareJoined();
        showSuccess(FOOD_SHARE_SUCCESS.shareJoined);
        showNotice(
          'Waiting for a partner',
          'We will notify you when someone joins this meal share.',
        );
        advanceDeck();
      }
    } catch (e) {
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.unableToJoin));
    } finally {
      setJoining(null);
    }
  }, [advanceDeck, current, joiningOrderId, router, setJoining, setLastMatch]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SwipeCinematicBackground />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Ionicons name="flame" size={22} color="#FF6B35" />
          <Text style={styles.headerTitle}>Swipe</Text>
          <FoodShareNotificationBell />
          <Text style={styles.headerSub}>
            Join admin meal shares and match with someone nearby
          </Text>
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

        {!loadingDeck && cards.length === 0 ? (
          <Text style={styles.empty}>
            No active meal shares yet. An admin must activate cards first.
          </Text>
        ) : null}

        <SwipeActionButtons
          disabled={!current}
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
        splitLabel={
          lastMatch
            ? `${formatShareCurrency(lastMatch.costBreakdown.totalPerUser)} each (${formatShareCurrency(lastMatch.costBreakdown.sharedPrice)} food + ${formatShareCurrency(lastMatch.costBreakdown.deliveryShare)} delivery)`
            : ''
        }
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
  root: { flex: 1, backgroundColor: '#06080C' },
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
    color: 'rgba(255,255,255,0.55)',
    flexBasis: '100%',
    marginLeft: 30,
    marginTop: -4,
  },
  empty: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    fontSize: 14,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
});
