import { theme } from '@/constants/theme';
import { auth, db } from '@/services/firebase';
import {
  ORDER_JOIN_WINDOW_MS,
  formatOrderCountdown,
  getParticipantJoinedAtForUser,
  normalizeOrderParticipantRecords,
  parseJoinedAtMs,
} from '@/services/orderLifecycle';
import { generateOrderShareLink } from '@/lib/invite-link';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type OrderDoc = {
  title: string;
  participantIds: string[];
  participantLines: string[];
  status: string;
};

function mapSnapToOrder(
  id: string,
  data: Record<string, unknown> | undefined,
): OrderDoc | null {
  if (!data) return null;
  const title =
    (typeof data.restaurantName === 'string' && data.restaurantName.trim()
      ? data.restaurantName
      : null) ??
    (typeof data.foodName === 'string' && data.foodName.trim()
      ? data.foodName
      : null) ??
    'Order';
  const participantIds: string[] = Array.isArray(data.participantIds)
    ? data.participantIds.filter((x): x is string => typeof x === 'string')
    : [];
  const records = normalizeOrderParticipantRecords(data.participants);
  const participantLines = participantIds.map((uid) => {
    const rec = records.find((r) => r.userId === uid);
    const j = rec ? parseJoinedAtMs(rec.joinedAt) : null;
    const joined =
      j != null
        ? `joined ${new Date(j).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
        : 'pending join record';
    return `• ${uid.slice(0, 8)}… — ${joined}`;
  });
  const status =
    typeof data.status === 'string' && data.status.trim()
      ? data.status
      : 'open';
  return {
    title,
    participantIds,
    participantLines,
    status,
  };
}

export default function OrderDetailsScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof rawId === 'string' ? rawId : '';
  const [order, setOrder] = useState<OrderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState<Record<string, unknown> | undefined>(
    undefined,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!orderId.trim()) {
      setOrder(null);
      setDocData(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'orders', orderId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setOrder(null);
          setDocData(undefined);
          setLoading(false);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        setDocData(data);
        setOrder(mapSnapToOrder(snap.id, data));
        setLoading(false);
      },
      () => {
        setOrder(null);
        setDocData(undefined);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [orderId]);

  const countdownLabel = useMemo(() => {
    const uid = auth.currentUser?.uid ?? '';
    if (!uid || !docData) return null;
    const records = normalizeOrderParticipantRecords(docData.participants);
    const joinedAt = getParticipantJoinedAtForUser(records, uid);
    const joinedMs = joinedAt ? parseJoinedAtMs(joinedAt) : null;
    if (joinedMs == null) return null;
    const rem = ORDER_JOIN_WINDOW_MS - (nowTick - joinedMs);
    if (rem <= 0) return "Time's up";
    return formatOrderCountdown(rem);
  }, [docData, nowTick]);

  const inviteWhatsApp = useCallback(async () => {
    const refUserId = auth.currentUser?.uid ?? null;
    const link = generateOrderShareLink(orderId, refUserId);
    const message = `Join my food order 🍕: ${link}`;
    const httpsUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    const appUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      if (await Linking.canOpenURL(httpsUrl)) {
        await Linking.openURL(httpsUrl);
        return;
      }
    } catch {
      // fall through
    }
    await Linking.openURL(appUrl).catch(() => {});
  }, [orderId]);

  if (!orderId.trim()) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.errorText}>Missing order id.</Text>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.errorText}>Order not found.</Text>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={12}
        >
          <MaterialIcons name="arrow-back" size={22} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.headerTitle}>Order</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{order.title}</Text>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Status</Text>
          <Text style={styles.pillValue}>{order.status}</Text>
        </View>
        {countdownLabel ? (
          <View style={styles.timerBox}>
            <Text style={styles.timerLabel}>Your time window</Text>
            <Text style={styles.timerValue}>{countdownLabel}</Text>
          </View>
        ) : null}
        <Text style={styles.sectionTitle}>Participants</Text>
        <View style={styles.participantCard}>
          {order.participantLines.length ? (
            order.participantLines.map((line, i) => (
              <Text key={`${line}-${i}`} style={styles.participantLine}>
                {line}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>No participants yet.</Text>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.primaryBtnPressed,
          ]}
          onPress={() => router.push(`/order/room/${orderId}` as never)}
        >
          <Text style={styles.primaryBtnText}>Open order room</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryInviteBtn,
            pressed && styles.primaryBtnPressed,
          ]}
          onPress={() => void inviteWhatsApp()}
        >
          <Text style={styles.secondaryInviteBtnText}>Invite on WhatsApp</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06080C',
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 38,
  },
  scroll: {
    paddingBottom: 32,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillLabel: {
    color: 'rgba(248,250,252,0.55)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillValue: {
    color: '#7DD3FC',
    fontSize: 18,
    fontWeight: '700',
  },
  timerBox: {
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.35)',
  },
  timerLabel: {
    color: 'rgba(250,250,250,0.65)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  timerValue: {
    color: '#FDE047',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  participantCard: {
    backgroundColor: '#11161F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  participantLine: {
    color: 'rgba(248,250,252,0.9)',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  muted: {
    color: 'rgba(248,250,252,0.45)',
    fontSize: 14,
  },
  primaryBtn: {
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    color: '#A7F3D0',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryInviteBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(37, 211, 102, 0.2)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.45)',
  },
  secondaryInviteBtnText: {
    color: '#86EFAC',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    color: '#7DD3FC',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 16,
    marginTop: 24,
  },
});
