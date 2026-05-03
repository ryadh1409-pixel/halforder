import { isAdminFoodCardSlotId } from '@/constants/adminFoodCards';
import { isAdminUser } from '@/constants/adminUid';
import {
  PAYMENT_MATCH_ALERT_MESSAGE,
  PAYMENT_MATCH_ALERT_TITLE,
} from '@/constants/paymentDisclaimer';
import { safeAlertBody, USER_ERROR_JOIN } from '@/lib/userFacingErrors';
import { theme } from '@/constants/theme';
import { FoodCard as FoodCardView } from '@/components/FoodCard';
import type { FoodSwipeCardDetailsProps } from '@/components/FoodSwipeCardDetails';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import {
  formatFoodCardSharingPriceLine,
  isFoodCardJoinDisabled,
  joinOrder,
  skipFoodCard,
  subscribeActiveFoodCards,
  type FoodCard as FoodCardModel,
} from '@/services/foodCards';
import { subscribeJoinHintsForFoodCard } from '@/services/foodCardSlotOrders';
import { subscribeActiveFoodTemplates } from '@/services/foodTemplates';
import type { FoodTemplate } from '@/types/food';
import { useAuth } from '@/services/AuthContext';
import { showError, showNotice } from '@/utils/toast';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

function formatTimer(expiresAt: number): string {
  const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildDetailsProps(args: {
  card: FoodCardModel;
  isActive: boolean;
  tick: number;
  uid: string | undefined;
  rowJoinDisabled: boolean;
  joining: boolean;
  topJoinHint: {
    primaryOpenUsers: string[];
    anyOpenOrderMemberIds: string[];
  } | null;
  router: ReturnType<typeof useRouter>;
  onLikeRef: React.MutableRefObject<(id?: string) => Promise<void>>;
}): FoodSwipeCardDetailsProps {
  const { card, isActive, tick, uid, rowJoinDisabled, joining, topJoinHint, router, onLikeRef } =
    args;
  const locationLine = card.venueLocation.trim()
    ? `Location: ${card.venueLocation.trim()}`
    : card.location
      ? 'Location included on this card'
      : 'Location not listed on this card';
  const timerText =
    isAdminFoodCardSlotId(card.id) || card.expiresAt > 1e15
      ? null
      : `Ends in ${formatTimer(card.expiresAt + tick * 0)}`;

  const matchDeckHint =
    !isActive || !uid || !topJoinHint
      ? null
      : topJoinHint.anyOpenOrderMemberIds.includes(uid)
        ? ('joined' as const)
        : topJoinHint.primaryOpenUsers.length >= 1
          ? ('waiting' as const)
          : ('open' as const);

  const joinLabel = !uid
    ? 'Sign in to join'
    : isActive && topJoinHint?.anyOpenOrderMemberIds?.includes(uid)
      ? 'Joined'
      : '❤️ Join order';

  return {
    title: card.title,
    aiDescription: card.aiDescription,
    priceLine: formatFoodCardSharingPriceLine(card.sharingPrice),
    restaurantName: card.restaurantName,
    locationLine,
    timerText,
    joinLabel,
    matchDeckHint,
    uid,
    joinPrimaryDisabled: rowJoinDisabled,
    joining: isActive && joining,
    hostPhoto: card.user1?.photo,
    hostName: card.user1?.name,
    showHostRow: Boolean(card.user1),
    onPressDetails: () => {
      router.push(`/order/${card.orderId ?? card.id}` as never);
    },
    onPressJoin: () => {
      void onLikeRef.current(card.id);
    },
  };
}

export default function SwipeExploreFeed() {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();

  const [cards, setCards] = useState<FoodCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsError, setCardsError] = useState(false);
  const [cardsRetryKey, setCardsRetryKey] = useState(0);
  const [tick, setTick] = useState(0);
  const [joining, setJoining] = useState(false);
  const hiddenUserIds = useHiddenUserIds();
  const [foodTemplates, setFoodTemplates] = useState<FoodTemplate[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<FoodCardModel>>(null);

  const [topJoinHint, setTopJoinHint] = useState<{
    primaryOpenUsers: string[];
    anyOpenOrderMemberIds: string[];
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setCardsError(false);
    const unsub = subscribeActiveFoodCards(
      (rows) => {
        setCardsError(false);
        setCards(rows);
        setLoading(false);
      },
      () => setCardsError(true),
    );
    return () => unsub();
  }, [cardsRetryKey]);

  useEffect(() => {
    const unsub = subscribeActiveFoodTemplates(
      (rows) => setFoodTemplates(rows),
      () => setFoodTemplates([]),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const uid = user?.uid;
  const adminPreview = isAdminUser(user, firestoreUserRole);
  const deckCards = useMemo(() => {
    let list = cards;
    if (adminPreview && uid) {
      list = list.filter((c) => typeof c.ownerId !== 'string' || c.ownerId !== uid);
    }
    if (uid && hiddenUserIds.size > 0) {
      list = list.filter(
        (c) => typeof c.ownerId !== 'string' || !hiddenUserIds.has(c.ownerId),
      );
    }
    return list;
  }, [cards, adminPreview, uid, hiddenUserIds]);

  const topCard = deckCards[activeIndex] ?? null;

  useEffect(() => {
    if (activeIndex >= deckCards.length && deckCards.length > 0) {
      const next = Math.max(0, deckCards.length - 1);
      setActiveIndex(next);
      listRef.current?.scrollToOffset({ offset: next * windowWidth, animated: false });
    }
    if (deckCards.length === 0) {
      setActiveIndex(0);
    }
  }, [deckCards.length, activeIndex, windowWidth]);

  useEffect(() => {
    if (!topCard?.id) {
      setTopJoinHint(null);
      return;
    }
    return subscribeJoinHintsForFoodCard(topCard.id, setTopJoinHint);
  }, [topCard?.id]);

  const joinBlockedForUser =
    !!uid &&
    !!topCard &&
    isFoodCardJoinDisabled(topCard, uid, topJoinHint?.anyOpenOrderMemberIds ?? null);
  const joinPrimaryDisabled = !topCard || joining || (!!uid && joinBlockedForUser);

  const removeCardById = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const onLike = async (cardId?: string) => {
    const targetId = cardId ?? topCard?.id;
    if (!targetId || joining) return;
    const joinUid = user?.uid;
    if (!joinUid) {
      showError('Sign in to join a food card.');
      router.push('/(auth)/login' as never);
      return;
    }
    const card = cards.find((c) => c.id === targetId) ?? topCard;
    const hint =
      card && topCard && card.id === topCard.id
        ? topJoinHint?.anyOpenOrderMemberIds ?? null
        : null;
    if (!card || isFoodCardJoinDisabled(card, joinUid, hint)) return;
    setJoining(true);
    try {
      const result = await joinOrder(targetId, joinUid);
      if (!result.ok) {
        if (!result.silent) {
          showError(safeAlertBody(result.message, USER_ERROR_JOIN));
        }
        return;
      }
      if (result.justBecamePair) {
        showNotice(PAYMENT_MATCH_ALERT_TITLE, PAYMENT_MATCH_ALERT_MESSAGE);
      }
      router.push(`/order/${result.orderId}` as never);
    } catch {
      showError(USER_ERROR_JOIN);
    } finally {
      setJoining(false);
    }
  };

  const onLikeRef = useRef(onLike);
  onLikeRef.current = onLike;

  const onSkip = async (cardId?: string) => {
    const targetId = cardId ?? topCard?.id;
    if (!targetId) return;
    await skipFoodCard(targetId);
    removeCardById(targetId);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  };

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / Math.max(1, windowWidth));
      setActiveIndex(Math.max(0, Math.min(i, Math.max(0, deckCards.length - 1))));
    },
    [windowWidth, deckCards.length],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FoodCardModel; index: number }) => {
      const isActive = index === activeIndex;
      const details = buildDetailsProps({
        card: item,
        isActive,
        tick,
        uid,
        rowJoinDisabled: isActive
          ? joinPrimaryDisabled
          : true,
        joining,
        topJoinHint,
        router,
        onLikeRef,
      });
      return (
        <View style={{ width: windowWidth, paddingHorizontal: 16, paddingTop: 4 }}>
          <FoodCardView imageUri={item.image} details={details} />
        </View>
      );
    },
    [
      activeIndex,
      tick,
      uid,
      joinPrimaryDisabled,
      joining,
      topJoinHint,
      router,
      windowWidth,
    ],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: windowWidth,
      offset: windowWidth * index,
      index,
    }),
    [windowWidth],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Swipe Food</Text>
        <Text style={styles.subtitle}>
          {adminPreview
            ? 'Admin preview · Join disabled · Skip to browse cards'
            : 'Swipe horizontally · Skip / Join below'}
        </Text>
        <TouchableOpacity
          activeOpacity={0.88}
          style={styles.dashboardBtn}
          onPress={() => router.push('/restaurant-dashboard' as never)}
        >
          <Text style={styles.dashboardBtnText}>Open Restaurant Dashboard</Text>
        </TouchableOpacity>
        {adminPreview ? (
          <View style={styles.adminBanner}>
            <Text style={styles.adminBannerText}>
              Admin account — swipe deck is view-only for joins (your cards are excluded).
            </Text>
          </View>
        ) : null}
      </View>
      {foodTemplates.length > 0 ? (
        <View style={styles.templateSection}>
          <Text style={styles.templateSectionTitle}>Order from menu</Text>
          <Text style={styles.templateSectionSub}>
            Tap to start an order with name, price, and photo filled in
          </Text>
          <FlatList
            horizontal
            data={foodTemplates}
            keyExtractor={(t) => t.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateStrip}
            renderItem={({ item: t }) => (
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.templateCard}
                onPress={() =>
                  router.push({
                    pathname: '/create',
                    params: {
                      fromFoodTemplate: '1',
                      prefillTitle: t.name,
                      prefillPriceSplit: `$${t.price.toFixed(2)}`,
                      prefillImageUrl: t.imageUrl,
                      prefillDescription: t.description,
                      templateId: t.id,
                    },
                  } as never)
                }
              >
                {t.imageUrl ? (
                  <ExpoImage
                    source={{ uri: t.imageUrl }}
                    style={styles.templateImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={t.id}
                  />
                ) : (
                  <View style={[styles.templateImage, styles.templateImagePh]} />
                )}
                <View style={styles.templateCardBody}>
                  <Text style={styles.templateName} numberOfLines={2}>
                    {t.name}
                  </Text>
                  <Text style={styles.templatePrice}>${t.price.toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#34D399" />
          <Text style={styles.loadingHint}>Loading food cards…</Text>
        </View>
      ) : !topCard ? (
        <View style={styles.centered}>
          {cardsError ? (
            <>
              <Text style={styles.empty}>
                Could not load food cards. Check your connection.
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setCardsError(false);
                  setCardsRetryKey((k) => k + 1);
                }}
              >
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : adminPreview && cards.length > 0 ? (
            <Text style={styles.empty}>
              No cards from other users to preview. Your admin listings are hidden here.
            </Text>
          ) : (
            <Text style={styles.empty}>No active food cards yet. Check back soon.</Text>
          )}
        </View>
      ) : (
        <View style={styles.deckWithActions}>
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            horizontal
            pagingEnabled
            data={deckCards}
            keyExtractor={(c) => c.id}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            removeClippedSubviews
            initialNumToRender={3}
            windowSize={5}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            extraData={{ activeIndex, tick, joining, topJoinHint }}
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.actionsBarWrap,
              { bottom: Math.max(20, 10 + insets.bottom) },
            ]}
          >
            <BlurView intensity={48} tint="dark" style={styles.actionsBlur}>
              <View style={styles.actionsInner}>
                <TouchableOpacity
                  disabled={joining}
                  onPress={() => void onSkip()}
                  style={[styles.skipBarBtn, joining && styles.barBtnDisabled]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.skipBarText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={joinPrimaryDisabled}
                  onPress={() => void onLike()}
                  style={[styles.joinBarBtn, joinPrimaryDisabled && styles.barBtnDisabled]}
                  activeOpacity={0.88}
                >
                  {joining ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.joinBarText}>
                      {!uid
                        ? 'Sign in'
                        : Boolean(topJoinHint?.anyOpenOrderMemberIds?.includes(uid))
                          ? 'Joined'
                          : 'Join'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A0F' },
  header: { paddingHorizontal: theme.spacing.screen, paddingVertical: 12 },
  templateSection: {
    paddingLeft: theme.spacing.screen,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  templateSectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  templateSectionSub: {
    color: 'rgba(248,250,252,0.5)',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
    paddingRight: theme.spacing.screen,
  },
  templateStrip: { paddingRight: theme.spacing.screen },
  templateCard: {
    width: 148,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#11161F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  templateImage: { width: '100%', height: 104, backgroundColor: '#1a1f28' },
  templateImagePh: { alignItems: 'center', justifyContent: 'center' },
  templateCardBody: { padding: 10 },
  templateName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  templatePrice: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
  },
  title: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  subtitle: { color: 'rgba(248,250,252,0.6)', marginTop: 4 },
  dashboardBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  dashboardBtnText: {
    color: '#A7F3D0',
    fontSize: 13,
    fontWeight: '800',
  },
  adminBanner: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  adminBannerText: {
    color: '#FDE68A',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingHint: {
    marginTop: 12,
    color: 'rgba(248,250,252,0.55)',
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    color: 'rgba(248,250,252,0.65)',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  retryBtnText: { color: '#A7F3D0', fontWeight: '800', fontSize: 15 },
  deckWithActions: { flex: 1, position: 'relative' },
  actionsBarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },
  actionsBlur: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(15, 23, 32, 0.65)',
  },
  actionsInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  skipBarBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  joinBarBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45, 212, 191, 0.88)',
  },
  barBtnDisabled: { opacity: 0.45 },
  skipBarText: {
    color: 'rgba(203, 213, 225, 0.95)',
    fontSize: 15,
    fontWeight: '600',
  },
  joinBarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
