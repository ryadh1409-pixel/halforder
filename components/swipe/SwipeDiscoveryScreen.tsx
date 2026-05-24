import { USER_ROUTES } from '@/lib/navigationPaths';
import { Ionicons } from '@expo/vector-icons';
import { SwipeActionButtons } from '@/components/swipe/SwipeActionButtons';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { SwipeDeck } from '@/components/swipe/SwipeDeck';
import { SwipeFilterChips } from '@/components/swipe/SwipeFilterChips';
import { SwipeMatchSheet } from '@/components/swipe/SwipeMatchSheet';
import {
  matchesSwipeFilter,
  type SwipeFilterKey,
} from '@/constants/swipeDiscovery';
import {
  getHeroImageUrlForType,
  mockOrders,
  type FoodOrderType,
} from '@/constants/mockSwipeFood';
import { haversineDistanceKm } from '@/lib/haversine';
import { acceptFoodSwipe } from '@/services/foodSwipeMatch';
import { ensureOrderChatInitialized } from '@/services/chat';
import { auth, db } from '@/services/firebase';
import {
  getCityFromCoordinates,
  getUserLocationSafe,
} from '@/services/location';
import { createSharedOrderRoom, recordSwipe } from '@/services/swipeService';
import { useSwipeStore } from '@/store/swipeStore';
import type { SwipeFoodCard } from '@/types/swipe';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError } from '@/utils/toast';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');

function inferFoodType(raw: string): FoodOrderType {
  if (raw.includes('burger')) return 'burger';
  if (raw.includes('noodle') || raw.includes('ramen')) return 'noodles';
  if (raw.includes('salad') || raw.includes('bowl') || raw.includes('veggie')) {
    return 'salad';
  }
  if (
    raw.includes('dessert') ||
    raw.includes('cake') ||
    raw.includes('sweet')
  ) {
    return 'dessert';
  }
  if (raw.includes('pizza')) return 'pizza';
  return 'other';
}

function categoriesForCard(
  title: string,
  type: FoodOrderType,
  price: number,
  explicit: unknown,
): SwipeFilterKey[] {
  const categories = new Set<SwipeFilterKey>(['for-you']);
  const add = (key: SwipeFilterKey) => categories.add(key);
  if (Array.isArray(explicit)) {
    explicit.forEach((value) => {
      if (
        value === 'vegetarian' ||
        value === 'pizza' ||
        value === 'burgers' ||
        value === 'late-night' ||
        value === 'cheap-eats' ||
        value === 'desserts'
      ) {
        add(value);
      }
    });
  }
  const t = title.toLowerCase();
  if (type === 'pizza') add('pizza');
  if (type === 'burger') add('burgers');
  if (type === 'dessert') add('desserts');
  if (type === 'salad' || t.includes('veggie') || t.includes('vegetarian')) {
    add('vegetarian');
  }
  if (price <= 12) add('cheap-eats');
  if (t.includes('late') || t.includes('midnight')) add('late-night');
  return [...categories];
}

function mapDocToCard(
  id: string,
  data: Record<string, unknown>,
  currentUid: string,
  loc: { latitude: number; longitude: number } | null,
  city: string,
): SwipeFoodCard {
  const rawCategory =
    typeof data.category === 'string'
      ? data.category.toLowerCase()
      : typeof data.mealType === 'string'
        ? data.mealType.toLowerCase()
        : typeof data.type === 'string'
          ? data.type.toLowerCase()
          : 'pizza';
  const plist = Array.isArray(data.participants)
    ? (data.participants as unknown[]).filter(
        (x): x is string => typeof x === 'string',
      )
    : [];
  const peopleJoined = Math.max(plist.length, 1);
  const maxPeople =
    typeof data.maxPeople === 'number'
      ? data.maxPeople
      : typeof data.maxParticipants === 'number'
        ? data.maxParticipants
        : 2;
  const price =
    typeof data.sharePrice === 'number'
      ? data.sharePrice
      : typeof data.pricePerPerson === 'number'
        ? data.pricePerPerson
        : typeof data.totalPrice === 'number'
          ? Math.round((data.totalPrice as number) / maxPeople)
          : 10;
  const title =
    typeof data.foodName === 'string' && data.foodName.trim()
      ? data.foodName.trim()
      : typeof data.title === 'string' && data.title.trim()
        ? data.title.trim()
        : 'Shared meal';
  const type = inferFoodType(`${rawCategory} ${title}`);
  const restaurantName =
    typeof data.restaurantName === 'string' && data.restaurantName.trim()
      ? data.restaurantName.trim()
      : 'Nearby spot';
  const restaurantId =
    typeof data.restaurantId === 'string' && data.restaurantId.trim()
      ? data.restaurantId.trim()
      : typeof data.vendorId === 'string' && data.vendorId.trim()
        ? data.vendorId.trim()
        : typeof data.createdBy === 'string'
          ? data.createdBy
          : 'unknown';
  const lat =
    (data.location as { latitude?: number })?.latitude ?? data.latitude;
  const lng =
    (data.location as { longitude?: number })?.longitude ?? data.longitude;
  let distance =
    typeof data.distance === 'string' ? data.distance : '0.5 km away';
  if (loc && typeof lat === 'number' && typeof lng === 'number') {
    distance = `${haversineDistanceKm(loc.latitude, loc.longitude, lat, lng).toFixed(1)} km away`;
  }

  const joinerNames = plist
    .filter((uid) => uid !== currentUid)
    .map((_, i) => ['Jude', 'Sam', 'Alex', 'Taylor'][i % 4] ?? 'Someone');

  return {
    id,
    title,
    restaurantName,
    restaurantId,
    type,
    price,
    splitPriceLabel: `Split: $${price} each`,
    time:
      typeof data.etaMinutes === 'number'
        ? `${data.etaMinutes} min`
        : typeof data.time === 'string'
          ? data.time
          : '20 min',
    distance,
    peopleJoined,
    spotsLeft: Math.max(0, maxPeople - peopleJoined),
    categories: categoriesForCard(title, type, price, data.categories),
    createdBy:
      typeof data.createdBy === 'string'
        ? data.createdBy
        : typeof data.userId === 'string'
          ? data.userId
          : '',
    userName: typeof data.userName === 'string' ? data.userName : 'Foodie',
    userAvatar: typeof data.userAvatar === 'string' ? data.userAvatar : null,
    isOwner: currentUid !== '' && data.createdBy === currentUid,
    distanceLabel: `${city} · ${distance}`,
    recentJoiners: joinerNames,
    heroImageUri: getHeroImageUrlForType(type),
  };
}

function mockToSwipeCards(): SwipeFoodCard[] {
  return mockOrders.map((m) => ({
    id: m.id,
    title: m.title,
    restaurantName: 'Queen St Kitchen',
    restaurantId: 'mock-queen-st-kitchen',
    type: m.type,
    price: m.price,
    splitPriceLabel: `Split: $${m.price} each`,
    time: m.time.replace(' min', '') + ' min',
    distance: m.distance + ' away',
    peopleJoined: m.peopleJoined,
    spotsLeft: m.spotsLeft,
    categories: m.categories as SwipeFilterKey[],
    createdBy: '',
    userName: 'Alex',
    userAvatar: null,
    isOwner: false,
    distanceLabel: `Toronto · ${m.distance}`,
    recentJoiners: m.peopleJoined > 1 ? ['Jude'] : [],
    heroImageUri: getHeroImageUrlForType(m.type),
  }));
}

/**
 * Signature viral tab — Tinder × Uber Eats split-order discovery.
 */
export function SwipeDiscoveryScreen() {
  const router = useRouter();
  const [actionSignal, setActionSignal] = useState<{
    id: number;
    direction: 'like' | 'pass';
  } | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(true);
  const activeFilter = useSwipeStore((s) => s.activeFilter);
  const deckIndex = useSwipeStore((s) => s.deckIndex);
  const cards = useSwipeStore((s) => s.cards);
  const joiningOrderId = useSwipeStore((s) => s.joiningOrderId);
  const lastMatch = useSwipeStore((s) => s.lastMatch);
  const setFilter = useSwipeStore((s) => s.setFilter);
  const setCards = useSwipeStore((s) => s.setCards);
  const advanceDeck = useSwipeStore((s) => s.advanceDeck);
  const setJoining = useSwipeStore((s) => s.setJoining);
  const setLastMatch = useSwipeStore((s) => s.setLastMatch);
  const resetDeck = useSwipeStore((s) => s.resetDeck);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    void (async () => {
      const loc = await getUserLocationSafe();
      if (cancelled) return;
      const city = loc
        ? await getCityFromCoordinates(loc.latitude, loc.longitude)
        : 'Toronto';
      const currentUid = auth.currentUser?.uid ?? '';
      const q = query(collection(db, 'orders'), where('status', '==', 'open'));
      unsub = onSnapshot(
        q,
        (snap) => {
          const live = snap.docs.map((d) =>
            mapDocToCard(
              d.id,
              d.data() as Record<string, unknown>,
              currentUid,
              loc,
              city || 'Toronto',
            ),
          );
          setCards(live.length > 0 ? live : mockToSwipeCards());
          setLoadingDeck(false);
        },
        () => {
          setCards(mockToSwipeCards());
          setLoadingDeck(false);
        },
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [setCards]);

  const filtered = useMemo(
    () => cards.filter((c) => matchesSwipeFilter(c, activeFilter)),
    [cards, activeFilter],
  );

  const current = filtered[deckIndex];
  const next = filtered[deckIndex + 1];
  const cardMaxH = Math.min(SCREEN_H * 0.52, 500);

  useEffect(() => {
    resetDeck();
  }, [activeFilter, resetDeck]);

  const handlePass = useCallback(async () => {
    if (!current) return;
    void Haptics.selectionAsync();
    void recordSwipe({
      orderId: current.id,
      foodId: current.id,
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
    if (current.isOwner) {
      showError('You cannot join your own order.');
      advanceDeck();
      return;
    }

    setJoining(current.id);
    void recordSwipe({
      orderId: current.id,
      foodId: current.id,
      restaurantId: current.restaurantId,
      direction: 'like',
    });

    try {
      const swipeResult = await acceptFoodSwipe(db, current.id, user.uid);
      if (!swipeResult.ok) throw new Error(swipeResult.error);

      await updateDoc(doc(db, 'orders', current.id), {
        participants: arrayUnion(user.uid),
        [`joinedAtMap.${user.uid}`]: serverTimestamp(),
      });

      if (swipeResult.matched) {
        try {
          await ensureOrderChatInitialized(current.id);
        } catch {
          // Chat can still initialize when the shared room is opened.
        }
        const sharedOrderId = await createSharedOrderRoom({
          orderId: current.id,
          matchId: swipeResult.matchId,
          participantIds: [user.uid, swipeResult.partnerUid],
          foodTitle: current.title,
          restaurantName: current.restaurantName,
          splitPrice: current.price,
          heroImageUri: current.heroImageUri,
        });
        setLastMatch({
          matchId: swipeResult.matchId,
          orderId: current.id,
          foodTitle: current.title,
          splitPrice: current.price,
          sharedOrderId,
          partnerUid: swipeResult.partnerUid,
        });
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      } else {
        advanceDeck();
      }
    } catch (e) {
      showError(getUserFriendlyError(e));
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
          <Text style={styles.headerSub}>Split meals with people nearby</Text>
        </View>

        <SwipeFilterChips active={activeFilter} onChange={setFilter} />

        <SwipeDeck
          current={current}
          next={next}
          cardMaxHeight={cardMaxH}
          loading={loadingDeck}
          actionSignal={actionSignal ?? undefined}
          onPass={() => void handlePass()}
          onLike={() => void handleLike()}
        />

        <SwipeActionButtons
          disabled={!current}
          loading={!!joiningOrderId}
          onPass={() => setActionSignal({ id: Date.now(), direction: 'pass' })}
          onLike={() => setActionSignal({ id: Date.now(), direction: 'like' })}
        />

        {filtered.length === 0 && cards.length > 0 ? (
          <Pressable style={styles.hint} onPress={() => setFilter('for-you')}>
            <Text style={styles.hintTxt}>
              No cards in this filter — try For You
            </Text>
          </Pressable>
        ) : null}
      </SafeAreaView>

      <SwipeMatchSheet
        visible={lastMatch != null}
        foodTitle={lastMatch?.foodTitle ?? ''}
        splitLabel={lastMatch ? `Split: $${lastMatch.splitPrice} each` : ''}
        onChat={() => {
          if (lastMatch) router.push(USER_ROUTES.order(lastMatch.orderId) as never);
          setLastMatch(null);
          advanceDeck();
        }}
        onCheckout={() => {
          if (lastMatch?.sharedOrderId) {
            router.push(`/shared-order/${lastMatch.sharedOrderId}` as never);
          } else if (lastMatch) {
            router.push(USER_ROUTES.order(lastMatch.orderId) as never);
          }
          setLastMatch(null);
          advanceDeck();
        }}
        onDismiss={() => {
          setLastMatch(null);
          advanceDeck();
        }}
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
    paddingBottom: 4,
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
  },
  headerSub: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    flexBasis: '100%',
    marginLeft: 30,
    marginTop: -4,
  },
  hint: { alignItems: 'center', paddingBottom: 8 },
  hintTxt: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
});
