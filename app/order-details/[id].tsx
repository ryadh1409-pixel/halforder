import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  doc,
  onSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
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
import { joinOrder as joinFirestoreOrder } from '@/services/joinOrder';
import { joinOrder as joinFoodCardOrder } from '@/services/foodCards';

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
  /** Present when row came from `food_cards` (swipe / admin cards). */
  foodCardStatus?: string;
};

function mapOrderDocument(snap: DocumentSnapshot): OrderDetails {
  const d = snap.data();
  if (!d) {
    throw new Error('Missing order data');
  }
  return {
    id: snap.id,
    foodName: String(d?.foodName ?? 'Shared order'),
    image:
      typeof d?.image === 'string' && d.image.trim()
        ? d.image
        : PLACEHOLDER_FOOD_IMAGE,
    pricePerPerson: Number(d?.pricePerPerson ?? 0),
    totalPrice: Number(d?.totalPrice ?? 0),
    peopleJoined: Number(d?.peopleJoined ?? 1),
    maxPeople: Number(d?.maxPeople ?? 2),
    location: String(d?.location ?? 'Nearby'),
    distance: Number(d?.distance ?? 0),
    timeRemaining: Number(d?.timeRemaining ?? 20),
    createdBy: String(d?.createdBy ?? ''),
  };
}

function mapFoodCardDocument(snap: DocumentSnapshot): OrderDetails {
  const d = snap.data();
  if (!d) {
    throw new Error('Missing food card data');
  }
  const joined = Array.isArray(d.joinedUsers)
    ? d.joinedUsers.filter((x: unknown): x is string => typeof x === 'string')
        .length
    : 0;
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
    peopleJoined: joined,
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

    let orderRow: OrderDetails | null = null;
    let cardRow: OrderDetails | null = null;
    let orderHeard = false;
    let cardHeard = false;

    const settle = () => {
      if (!orderHeard || !cardHeard) return;
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

    const unsubOrder = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        orderHeard = true;
        try {
          orderRow = snap.exists() ? mapOrderDocument(snap) : null;
        } catch {
          orderRow = null;
        }
        settle();
      },
      () => {
        orderHeard = true;
        orderRow = null;
        settle();
      },
    );

    const unsubCard = onSnapshot(
      doc(db, 'food_cards', orderId),
      (snap) => {
        cardHeard = true;
        try {
          cardRow = snap.exists() ? mapFoodCardDocument(snap) : null;
        } catch {
          cardRow = null;
        }
        settle();
      },
      () => {
        cardHeard = true;
        cardRow = null;
        settle();
      },
    );

    return () => {
      unsubOrder();
      unsubCard();
    };
  }, [orderId]);

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
        if (result.alreadyJoined) {
          Alert.alert('Already joined', 'You are already on this card.');
        } else if (result.isFull) {
          Alert.alert('Order full', 'This card has reached the maximum joiners.');
        } else {
          Alert.alert('Joined', 'You have joined this food card.');
        }
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
        <TouchableOpacity
          style={[
            styles.joinButton,
            (joining ||
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
