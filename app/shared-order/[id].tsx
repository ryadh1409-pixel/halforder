import { USER_ROUTES } from '@/lib/navigationPaths';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { useMatchStore } from '@/store/matchStore';
import type {
  SharedOrderMessage,
  SharedOrderParticipant,
  SharedOrderRoom,
} from '@/types/swipe';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth, db } from '@/services/firebase';

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseRoom(id: string, data: Record<string, unknown>): SharedOrderRoom {
  const participantIds = Array.isArray(data.participantIds)
    ? data.participantIds.filter((x): x is string => typeof x === 'string')
    : [];
  const splitPrice = asNumber(data.splitPrice, 0);
  const cartItems = Array.isArray(data.cartItems)
    ? data.cartItems
        .filter((item): item is Record<string, unknown> => {
          return typeof item === 'object' && item != null;
        })
        .map((item) => ({
          id: asString(item.id, id),
          title: asString(item.title, asString(data.foodTitle, 'Shared meal')),
          quantity: asNumber(item.quantity, participantIds.length || 2),
          pricePerPerson: asNumber(item.pricePerPerson, splitPrice),
          total: asNumber(
            item.total,
            splitPrice * Math.max(participantIds.length, 2),
          ),
        }))
    : [];

  return {
    id,
    orderId: asString(data.orderId),
    matchId: asString(data.matchId) || undefined,
    participantIds,
    foodTitle: asString(data.foodTitle, 'Shared meal'),
    restaurantName: asString(data.restaurantName, 'Nearby restaurant'),
    heroImageUri: asString(data.heroImageUri),
    splitPrice,
    cartSubtotal: asNumber(
      data.cartSubtotal,
      splitPrice * Math.max(participantIds.length, 2),
    ),
    status:
      data.status === 'checkout_started' ||
      data.status === 'paid' ||
      data.status === 'cancelled'
        ? data.status
        : 'open',
    cartItems,
  };
}

function Avatar({ participant }: { participant: SharedOrderParticipant }) {
  return (
    <View style={styles.person}>
      {participant.photoURL ? (
        <Image source={{ uri: participant.photoURL }} style={styles.avatar} />
      ) : (
        <LinearGradient
          colors={
            participant.isCurrentUser
              ? ['#A855F7', '#C084FC']
              : ['#22C55E', '#02A8FF']
          }
          style={styles.avatar}
        >
          <Text style={styles.avatarLetter}>
            {participant.displayName.slice(0, 1).toUpperCase()}
          </Text>
        </LinearGradient>
      )}
      <Text style={styles.personName} numberOfLines={1}>
        {participant.isCurrentUser ? 'You' : participant.displayName}
      </Text>
      <Text style={styles.personRole}>
        {participant.isCurrentUser ? 'Ready to split' : 'Matched nearby'}
      </Text>
    </View>
  );
}

export default function SharedOrderRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const roomId = typeof params.id === 'string' ? params.id : '';
  const [startingCheckout, setStartingCheckout] = useState(false);

  const room = useMatchStore((s) => s.activeRoom);
  const participants = useMatchStore((s) => s.participants);
  const messages = useMatchStore((s) => s.messages);
  const loading = useMatchStore((s) => s.loading);
  const setActiveRoomId = useMatchStore((s) => s.setActiveRoomId);
  const setActiveRoom = useMatchStore((s) => s.setActiveRoom);
  const setParticipants = useMatchStore((s) => s.setParticipants);
  const setMessages = useMatchStore((s) => s.setMessages);
  const setLoading = useMatchStore((s) => s.setLoading);
  const clearMatchRoom = useMatchStore((s) => s.clearMatchRoom);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return undefined;
    }
    setActiveRoomId(roomId);
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'sharedOrders', roomId),
      (snap) => {
        if (!snap.exists()) {
          setActiveRoom(null);
          setLoading(false);
          return;
        }
        setActiveRoom(
          parseRoom(snap.id, snap.data() as Record<string, unknown>),
        );
        setLoading(false);
      },
      () => {
        setActiveRoom(null);
        setLoading(false);
      },
    );
    return () => {
      unsub();
      clearMatchRoom();
    };
  }, [clearMatchRoom, roomId, setActiveRoom, setActiveRoomId, setLoading]);

  useEffect(() => {
    if (!room?.participantIds.length) {
      setParticipants([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const currentUid = auth.currentUser?.uid ?? '';
      const next: SharedOrderParticipant[] = [];
      for (const uid of room.participantIds) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          const data = snap.exists() ? snap.data() : {};
          next.push({
            uid,
            displayName:
              asString(data?.displayName) ||
              asString(data?.name) ||
              (uid === currentUid ? 'You' : 'Foodie'),
            photoURL: asString(data?.photoURL) || null,
            isCurrentUser: uid === currentUid,
          });
        } catch {
          next.push({
            uid,
            displayName: uid === currentUid ? 'You' : 'Foodie',
            photoURL: null,
            isCurrentUser: uid === currentUid,
          });
        }
      }
      if (!cancelled) setParticipants(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [room?.participantIds, setParticipants]);

  useEffect(() => {
    if (!room?.orderId) {
      setMessages([]);
      return undefined;
    }
    const q = query(
      collection(db, 'orders', room.orderId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(3),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: SharedOrderMessage[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            text: asString(data.text, 'Message'),
            senderName:
              asString(data.senderName) ||
              asString(data.userName) ||
              'Food match',
            createdAt: data.createdAt,
          };
        });
        setMessages(next);
      },
      () => setMessages([]),
    );
    return unsub;
  }, [room?.orderId, setMessages]);

  const perPerson = useMemo(() => {
    const count = Math.max(
      participants.length || room?.participantIds.length || 2,
      1,
    );
    return room ? room.cartSubtotal / count : 0;
  }, [participants.length, room]);

  const handleCheckoutTogether = async () => {
    if (!room) return;
    setStartingCheckout(true);
    try {
      await updateDoc(doc(db, 'sharedOrders', room.id), {
        status: 'checkout_started',
        checkoutStartedBy: auth.currentUser?.uid ?? '',
        updatedAt: serverTimestamp(),
      });
    } catch {
      // If the status write is blocked offline or by rules, still let members continue.
    } finally {
      setStartingCheckout(false);
      router.push(USER_ROUTES.order(room.orderId) as never);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <SwipeCinematicBackground />
        <ActivityIndicator color="#A855F7" size="large" />
        <Text style={styles.loadingText}>Opening shared order...</Text>
      </View>
    );
  }

  if (!room) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <SwipeCinematicBackground />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Shared order not found</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryTxt}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <SwipeCinematicBackground />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
          <View>
            <Text style={styles.kicker}>Shared order room</Text>
            <Text style={styles.title}>Split this together</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          {room.heroImageUri ? (
            <Image
              source={{ uri: room.heroImageUri }}
              style={styles.heroImage}
            />
          ) : null}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.92)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroCopy}>
            <Text style={styles.restaurant}>{room.restaurantName}</Text>
            <Text style={styles.food}>{room.foodTitle}</Text>
            <Text style={styles.split}>${perPerson.toFixed(2)} each</Text>
          </View>
        </View>

        <GlassCard>
          <Text style={styles.sectionTitle}>Matched people</Text>
          <View style={styles.peopleGrid}>
            {participants.map((participant) => (
              <Avatar key={participant.uid} participant={participant} />
            ))}
          </View>
        </GlassCard>

        <GlassCard>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Realtime cart</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTxt}>Live</Text>
            </View>
          </View>
          {room.cartItems.map((item) => (
            <View key={item.id} style={styles.cartRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartTitle}>{item.title}</Text>
                <Text style={styles.cartMeta}>
                  {item.quantity} people x ${item.pricePerPerson.toFixed(2)}
                </Text>
              </View>
              <Text style={styles.cartTotal}>${item.total.toFixed(2)}</Text>
            </View>
          ))}
        </GlassCard>

        <GlassCard>
          <Text style={styles.sectionTitle}>Split subtotal</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Room subtotal</Text>
            <Text style={styles.totalValue}>
              ${room.cartSubtotal.toFixed(2)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Your split</Text>
            <Text style={styles.perPerson}>${perPerson.toFixed(2)}</Text>
          </View>
        </GlassCard>

        <GlassCard>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Chat preview</Text>
            <Pressable
              onPress={() => router.push(USER_ROUTES.order(room.orderId) as never)}
            >
              <Text style={styles.link}>Open chat</Text>
            </Pressable>
          </View>
          {messages.length > 0 ? (
            messages.map((message) => (
              <View key={message.id} style={styles.messageRow}>
                <Text style={styles.messageName}>{message.senderName}</Text>
                <Text style={styles.messageText} numberOfLines={1}>
                  {message.text}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>
              Chat is ready once you start coordinating the shared order.
            </Text>
          )}
        </GlassCard>

        <View style={{ height: 92 }} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.checkoutBtn}
          disabled={startingCheckout}
          onPress={handleCheckoutTogether}
        >
          {startingCheckout ? (
            <ActivityIndicator color="#05070A" />
          ) : (
            <>
              <Ionicons name="flame" size={20} color="#05070A" />
              <Text style={styles.checkoutTxt}>Checkout together</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.glass}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={34} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.glassInner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  content: { padding: 18, paddingBottom: 24 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  kicker: {
    color: '#C084FC',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroCard: {
    height: 290,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#171922',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroCopy: { position: 'absolute', left: 22, right: 22, bottom: 22 },
  restaurant: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  food: {
    color: '#FFF',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 6,
  },
  split: { color: '#C084FC', fontSize: 23, fontWeight: '900', marginTop: 8 },
  glass: {
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  glassInner: { padding: 18 },
  sectionTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  peopleGrid: { flexDirection: 'row', gap: 12, marginTop: 14 },
  person: {
    flex: 1,
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  personName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 10,
    maxWidth: '100%',
  },
  personRole: {
    color: '#B7BDC9',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(6,193,103,0.12)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  liveTxt: { color: '#C084FC', fontSize: 12, fontWeight: '900' },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  cartTitle: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  cartMeta: {
    color: '#B7BDC9',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  cartTotal: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 15,
    fontWeight: '700',
  },
  totalValue: { color: '#FFF', fontSize: 17, fontWeight: '900' },
  perPerson: { color: '#C084FC', fontSize: 24, fontWeight: '900' },
  link: { color: '#C084FC', fontWeight: '900' },
  messageRow: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  messageName: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  messageText: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 3,
  },
  muted: {
    color: '#B7BDC9',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 12,
  },
  footer: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 22,
  },
  checkoutBtn: {
    height: 58,
    borderRadius: 999,
    backgroundColor: '#7DFFB8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#22C55E',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  checkoutTxt: { color: '#05070A', fontSize: 17, fontWeight: '900' },
  empty: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 18,
  },
  primaryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: '#000000',
  },
  primaryTxt: { color: '#05070A', fontWeight: '900' },
});
