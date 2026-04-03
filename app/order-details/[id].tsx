import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  doc,
  onSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { blockUser, hasBlockBetween } from '@/services/blocks';
import { auth, db } from '@/services/firebase';
import {
  joinHalfOrderByOrderId,
  joinOrder as joinFirestoreOrder,
} from '@/services/joinOrder';
import { joinOrder as joinFoodCardOrder } from '@/services/foodCards';
import { normalizeParticipantsStrings } from '@/services/orderLifecycle';

const PLACEHOLDER_FOOD_IMAGE =
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80';

type OrderDetails = {
  id: string;
  foodName: string;
  image: string;
  pricePerPerson: number;
  totalPrice: number;
  peopleJoined: number;
  maxPeople: number;
  location: string;
  distance: number;
  timeRemaining: number;
  createdBy: string;
  /** HalfOrder swipe flow (`orders.users`). */
  usesHalfUsers?: boolean;
  /** All member uids (HalfOrder `users` or legacy `participants`). */
  memberIds?: string[];
  /** Present when row came from `food_cards` (swipe / admin cards). */
  foodCardStatus?: string;
};

function mapOrderDocument(snap: DocumentSnapshot): OrderDetails {
  const d = snap.data();
  if (!d) {
    throw new Error('Missing order data');
  }
  const usersList = Array.isArray(d?.users)
    ? (d.users as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const partCount = normalizeParticipantsStrings(d?.participants).length;
  const peopleJoined =
    usersList.length > 0
      ? usersList.length
      : partCount > 0
        ? partCount
        : Number(d?.peopleJoined ?? 1);
  const createdBy =
    typeof d?.createdBy === 'string' && d.createdBy
      ? d.createdBy
      : usersList[0] ?? '';
  const participantsList = normalizeParticipantsStrings(d?.participants);
  const memberIds =
    usersList.length > 0 ? usersList : participantsList;
  return {
    id: snap.id,
    foodName: String(d?.foodName ?? 'Shared order'),
    image:
      typeof d?.image === 'string' && d.image.trim()
        ? d.image
        : PLACEHOLDER_FOOD_IMAGE,
    pricePerPerson: Number(d?.pricePerPerson ?? 0),
    totalPrice: Number(d?.totalPrice ?? 0),
    peopleJoined,
    maxPeople: Number(d?.maxPeople ?? d?.maxUsers ?? 2),
    location: String(d?.location ?? 'Nearby'),
    distance: Number(d?.distance ?? 0),
    timeRemaining: Number(d?.timeRemaining ?? 20),
    createdBy: String(createdBy),
    usesHalfUsers: usersList.length > 0,
    memberIds,
  };
}

function mapFoodCardDocument(snap: DocumentSnapshot): OrderDetails {
  const d = snap.data();
  if (!d) {
    throw new Error('Missing food card data');
  }
  const max =
    typeof d.maxUsers === 'number' && d.maxUsers > 0 ? d.maxUsers : 2;
  const exp = typeof d.expiresAt === 'number' ? d.expiresAt : 0;
  const msLeft = Math.max(0, exp - Date.now());
  const timeRemainingMinutes =
    msLeft > 0 ? Math.max(1, Math.ceil(msLeft / 60000)) : 0;
  const img =
    typeof d.image === 'string' && d.image.trim()
      ? d.image.trim()
      : PLACEHOLDER_FOOD_IMAGE;
  const loc =
    typeof d.restaurantName === 'string' && d.restaurantName.trim()
      ? d.restaurantName.trim()
      : d.location
        ? 'Location on file'
        : 'Nearby';
  return {
    id: snap.id,
    foodName: String(d.title ?? 'Food card'),
    image: img,
    pricePerPerson: Number(d.splitPrice ?? 0),
    totalPrice: Number(d.price ?? 0),
    peopleJoined: 0,
    maxPeople: max,
    location: loc,
    distance: 0,
    timeRemaining: timeRemainingMinutes || 1,
    createdBy: String(d.ownerId ?? ''),
    foodCardStatus: typeof d.status === 'string' ? d.status : undefined,
  };
}

export default function OrderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const orderId = String(params.id ?? '');

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [detailSource, setDetailSource] = useState<'order' | 'food_card' | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const prevJoinedCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!orderId.trim()) {
      setOrder(null);
      setDetailSource(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setOrder(null);
    setDetailSource(null);

    let primaryOrderRow: OrderDetails | null = null;
    let linkedOrderRow: OrderDetails | null = null;
    let cardRow: OrderDetails | null = null;
    let primaryHeard = false;
    let cardHeard = false;
    let linkedHeard = true;
    let unsubLinked: (() => void) | null = null;

    const settle = () => {
      if (!primaryHeard || !cardHeard || !linkedHeard) return;
      const orderRow = primaryOrderRow ?? linkedOrderRow ?? null;
      if (orderRow) {
        setDetailSource('order');
        setOrder(orderRow);
        setCountdownSec(Math.max(orderRow.timeRemaining, 0) * 60);
      } else if (cardRow) {
        setDetailSource('food_card');
        setOrder(cardRow);
        setCountdownSec(Math.max(cardRow.timeRemaining, 0) * 60);
      } else {
        setDetailSource(null);
        setOrder(null);
      }
      setLoading(false);
    };

    const subLinkedOrder = (rawOid: unknown) => {
      if (unsubLinked) {
        unsubLinked();
        unsubLinked = null;
      }
      linkedOrderRow = null;
      const oid =
        typeof rawOid === 'string' && rawOid.trim() ? rawOid.trim() : '';
      if (!oid || oid === orderId) {
        linkedHeard = true;
        settle();
        return;
      }
      linkedHeard = false;
      unsubLinked = onSnapshot(
        doc(db, 'orders', oid),
        (snap) => {
          linkedHeard = true;
          try {
            linkedOrderRow = snap.exists() ? mapOrderDocument(snap) : null;
          } catch {
            linkedOrderRow = null;
          }
          settle();
        },
        () => {
          linkedHeard = true;
          linkedOrderRow = null;
          settle();
        },
      );
    };

    const unsubOrderPrimary = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        primaryHeard = true;
        try {
          primaryOrderRow = snap.exists() ? mapOrderDocument(snap) : null;
        } catch {
          primaryOrderRow = null;
        }
        settle();
      },
      () => {
        primaryHeard = true;
        primaryOrderRow = null;
        settle();
      },
    );

    const unsubCard = onSnapshot(
      doc(db, 'food_cards', orderId),
      (snap) => {
        cardHeard = true;
        try {
          cardRow = snap.exists() ? mapFoodCardDocument(snap) : null;
          const oid = snap.exists() ? snap.data()?.orderId : undefined;
          subLinkedOrder(oid);
        } catch {
          cardRow = null;
          subLinkedOrder(undefined);
        }
        settle();
      },
      () => {
        cardHeard = true;
        cardRow = null;
        subLinkedOrder(undefined);
        settle();
      },
    );

    return () => {
      unsubOrderPrimary();
      unsubCard();
      if (unsubLinked) unsubLinked();
    };
  }, [orderId]);

  useEffect(() => {
    if (!order || detailSource !== 'order') {
      prevJoinedCountRef.current = null;
      return;
    }
    if (!order.usesHalfUsers) {
      prevJoinedCountRef.current = order.peopleJoined;
      return;
    }
    const prev = prevJoinedCountRef.current;
    prevJoinedCountRef.current = order.peopleJoined;
    if (prev === 1 && order.peopleJoined >= 2 && auth.currentUser?.uid) {
      Alert.alert(
        'Someone joined your order!',
        'Open chat to coordinate.',
      );
    }
  }, [order?.peopleJoined, order?.id, detailSource, order?.usesHalfUsers]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !order?.createdBy || uid === order.createdBy) {
      setIsBlocked(false);
      return;
    }
    let cancelled = false;
    hasBlockBetween(uid, order.createdBy)
      .then((v) => {
        if (!cancelled) setIsBlocked(v);
      })
      .catch(() => {
        if (!cancelled) setIsBlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [order?.createdBy]);

  useEffect(() => {
    if (countdownSec <= 0) return;
    const id = setInterval(() => {
      setCountdownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [countdownSec]);

  const remainingSpots = useMemo(() => {
    if (!order) return 0;
    return Math.max(order.maxPeople - order.peopleJoined, 0);
  }, [order]);

  const viewerUid = auth.currentUser?.uid;
  const alreadyMember = !!(
    viewerUid &&
    order?.memberIds &&
    order.memberIds.includes(viewerUid)
  );

  const countdownLabel = useMemo(() => {
    const mins = Math.floor(countdownSec / 60);
    const secs = countdownSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [countdownSec]);

  const handleJoinOrder = async () => {
    if (!order || !detailSource) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/order-details/' + order.id);
      return;
    }
    setJoining(true);
    try {
      if (detailSource === 'food_card') {
        const result = await joinFoodCardOrder(order.id, uid);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
        if (result.justBecamePair) {
          Alert.alert(
            'Someone joined your order!',
            'Say hi in chat.',
          );
        }
        router.replace(`/order-details/${result.orderId}` as never);
        return;
      }
      if (order.usesHalfUsers) {
        const half = await joinHalfOrderByOrderId(order.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
        if (half.justBecamePair) {
          Alert.alert('Someone joined your order!', 'Say hi in chat.');
        }
        router.push(`/order-details/${order.id}` as never);
        return;
      }
      await joinFirestoreOrder(order.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      router.push(`/order-details/${order.id}` as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join order.';
      console.error('[order-details join]', msg, e);
      Alert.alert('Join failed', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
    } finally {
      setJoining(false);
    }
  };

  const handleBlockUser = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !order?.createdBy || uid === order.createdBy) return;
    Alert.alert('Block user', 'Are you sure you want to block this user?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBlocking(true);
            try {
              await blockUser(uid, order.createdBy);
              setIsBlocked(true);
              Alert.alert('Blocked', 'User has been blocked.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to block user.';
              Alert.alert('Block failed', msg);
            } finally {
              setBlocking(false);
            }
          })();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <ShimmerSkeleton width="92%" height={220} borderRadius={18} style={styles.skeletonGap} />
        <ShimmerSkeleton width="72%" height={22} style={styles.skeletonGapLine} />
        <ShimmerSkeleton width="44%" height={14} />
        <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <Text style={styles.emptyText}>Order not found.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenFadeIn style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: order.image }} style={styles.image} />
        <Text style={styles.foodName}>{order.foodName}</Text>
        <Text style={styles.price}>${order.pricePerPerson.toFixed(2)} per person</Text>
        <View style={styles.card}>
          <Text style={styles.meta}>Total: ${order.totalPrice.toFixed(2)}</Text>
          <Text style={styles.meta}>
            Joined: {order.peopleJoined}/{order.maxPeople}
          </Text>
          <Text style={styles.meta}>Remaining spots: {remainingSpots}</Text>
          <Text style={styles.meta}>Distance: {order.distance.toFixed(1)} km</Text>
          <Text style={styles.meta}>Location: {order.location}</Text>
          <TouchableOpacity
            onPress={() =>
              order.createdBy
                ? router.push({
                    pathname: '/user/[id]',
                    params: { id: order.createdBy },
                  } as never)
                : undefined
            }
            disabled={!order.createdBy}
            activeOpacity={0.8}
          >
            <Text style={[styles.meta, styles.linkMeta]}>
              Created by: {order.createdBy || 'Unknown'}
            </Text>
          </TouchableOpacity>
          <View style={styles.timerRow}>
            <Text style={styles.timerLabel}>Time remaining</Text>
            <Text style={styles.timerValue}>{countdownLabel}</Text>
          </View>
        </View>
        {detailSource === 'order' && order.usesHalfUsers ? (
          <TouchableOpacity
            style={styles.chatNavButton}
            onPress={() => router.push(`/chat/${order.id}` as never)}
            activeOpacity={0.85}
          >
            <Text style={styles.chatNavButtonText}>Open order chat</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[
            styles.joinButton,
            (joining ||
              alreadyMember ||
              remainingSpots <= 0 ||
              isBlocked ||
              (detailSource === 'food_card' &&
                order.foodCardStatus != null &&
                order.foodCardStatus !== 'active')) &&
              styles.joinButtonDisabled,
          ]}
          onPress={handleJoinOrder}
          disabled={
            joining ||
            alreadyMember ||
            remainingSpots <= 0 ||
            isBlocked ||
            (detailSource === 'food_card' &&
              order.foodCardStatus != null &&
              order.foodCardStatus !== 'active')
          }
          activeOpacity={0.85}
        >
          <Text style={styles.joinButtonText}>
            {joining
              ? 'Joining...'
              : alreadyMember
                ? 'Joined'
                : isBlocked
                  ? 'Blocked'
                  : detailSource === 'food_card' &&
                      order.foodCardStatus != null &&
                      order.foodCardStatus !== 'active'
                    ? 'Not available'
                    : remainingSpots <= 0
                      ? 'Order Full'
                      : 'Join Order'}
          </Text>
        </TouchableOpacity>
        {auth.currentUser?.uid && order.createdBy && auth.currentUser.uid !== order.createdBy ? (
          <TouchableOpacity
            style={[styles.blockButton, blocking && styles.joinButtonDisabled]}
            onPress={handleBlockUser}
            disabled={blocking}
            activeOpacity={0.85}
          >
            <Text style={styles.blockButtonText}>{blocking ? 'Blocking...' : 'Block User'}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D10' },
  loadingWrap: {
    flex: 1,
    backgroundColor: '#0B0D10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { color: '#E5E7EB', fontSize: 16 },
  skeletonGap: { marginBottom: 16 },
  skeletonGapLine: { marginBottom: 10 },
  backBtn: {
    marginTop: 14,
    backgroundColor: '#141922',
    borderColor: '#232A35',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: { color: '#C7D2FE', fontWeight: '700' },
  content: { padding: 16, paddingBottom: 32 },
  image: { width: '100%', height: 260, borderRadius: 20, marginBottom: 14 },
  foodName: { color: '#F8FAFC', fontSize: 28, fontWeight: '800' },
  price: { color: '#6EE7B7', fontSize: 18, fontWeight: '700', marginTop: 6, marginBottom: 14 },
  card: {
    backgroundColor: '#141922',
    borderColor: '#232A35',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  meta: { color: '#D1D5DB', fontSize: 14 },
  linkMeta: { textDecorationLine: 'underline' },
  timerRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerLabel: { color: '#FB923C', fontSize: 14, fontWeight: '700' },
  timerValue: { color: '#FB923C', fontSize: 24, fontWeight: '900' },
  chatNavButton: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chatNavButtonText: { color: '#7dd3fc', fontWeight: '800', fontSize: 16 },
  joinButton: {
    marginTop: 16,
    backgroundColor: '#34D399',
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: { opacity: 0.6 },
  joinButtonText: { color: '#052E1A', fontSize: 16, fontWeight: '800' },
  blockButton: {
    marginTop: 10,
    backgroundColor: '#261317',
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4B1D24',
  },
  blockButtonText: { color: '#FCA5A5', fontSize: 14, fontWeight: '800' },
});
