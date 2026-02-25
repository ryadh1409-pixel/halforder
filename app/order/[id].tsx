import { doc, onSnapshot } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrderRatingPrompt } from '@/components/order-rating-prompt';
import { formatTorontoOrderTime } from '@/lib/format-toronto-time';
import { reportAndBlock } from '@/services/report-block';
import { auth, db } from '../../services/firebase';

const FOOD_EMOJI: Record<string, string> = {
  pizza: '🍕',
  noodles: '🍜',
};

type OrderData = {
  foodType: string;
  restaurantName: string;
  restaurantLocation: string;
  orderTime: string;
  orderAtMs: number | null;
  maxPeople: number;
  joinedCount: number;
  participants: string[];
  participantUids: string[];
  status: string;
  pricePerPerson: number | null;
} | null;

export default function OrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderData>(null);
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const hasPromptedRating = useRef(false);

  useEffect(() => {
    if (!id) return;
    const orderRef = doc(db, 'orders', id);
    const unsubscribe = onSnapshot(
      orderRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setOrder({
            foodType: typeof d?.foodType === 'string' ? d.foodType : 'pizza',
            restaurantName:
              typeof d?.restaurantName === 'string' && d.restaurantName.trim()
                ? d.restaurantName
                : 'Not specified',
            restaurantLocation: typeof d?.restaurantLocation === 'string' ? d.restaurantLocation : '',
            orderTime: typeof d?.orderTime === 'string' ? d.orderTime : 'Now',
            orderAtMs: d?.orderAt?.toMillis?.() ?? d?.orderAt ?? null,
            maxPeople: Number(d?.maxPeople ?? 0),
            joinedCount: Number(d?.joinedCount ?? 0),
            participants: Array.isArray(d?.participants) ? d.participants : [],
            participantUids: Array.isArray(d?.participantUids) ? d.participantUids : [],
            status: typeof d?.status === 'string' ? d.status : 'open',
            pricePerPerson: typeof d?.pricePerPerson === 'number' ? d.pricePerPerson : null,
          });
        } else {
          setOrder(null);
        }
      },
      () => setOrder(null)
    );
    setLoading(false);
    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    hasPromptedRating.current = false;
  }, [id]);

  useEffect(() => {
    if (order?.status === 'closed' && !hasPromptedRating.current) {
      hasPromptedRating.current = true;
      setShowRating(true);
    }
  }, [order?.status]);

  if (loading || !order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          <Text style={{ color: '#64748b' }}>Order not found</Text>
        )}
      </SafeAreaView>
    );
  }

  const foodType = (order.foodType || 'pizza').toLowerCase();
  const foodLabel = foodType.charAt(0).toUpperCase() + foodType.slice(1);
  const emoji = FOOD_EMOJI[foodType] ?? '🍽️';
  const uid = auth.currentUser?.uid ?? '';
  const isParticipant = uid !== '' && order.participantUids.includes(uid);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 24 }}>
      {isParticipant && order.status === 'closed' ? (
        <OrderRatingPrompt
          orderId={id ?? ''}
          visible={showRating}
          onDismiss={() => setShowRating(false)}
        />
      ) : null}
      {order.status === 'matched' && (
        <View
          style={{
            backgroundColor: '#dcfce7',
            padding: 16,
            borderRadius: 12,
            marginBottom: 24,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#166534', marginBottom: 6 }}>
            🎉 Order matched!
          </Text>
          <Text style={{ fontSize: 14, color: '#15803d' }}>
            Create WhatsApp group and share link
          </Text>
        </View>
      )}

      {isParticipant && (
        <TouchableOpacity
          onPress={() => router.push(`/order/${id}/chat`)}
          style={{
            backgroundColor: '#2563eb',
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 10,
            marginBottom: 24,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Open Chat</Text>
        </TouchableOpacity>
      )}

      <Text style={{ fontSize: 28, fontWeight: '700', color: '#22223b', marginBottom: 8 }}>
        {emoji} {foodLabel}
      </Text>
      <Text style={{ fontSize: 16, color: '#64748b', marginBottom: 4 }}>
        {order.restaurantName}
      </Text>
      {order.restaurantLocation ? (
        <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
          📍 {order.restaurantLocation}
        </Text>
      ) : null}
      <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
        {order.orderAtMs != null ? `⏰ ${formatTorontoOrderTime(order.orderAtMs)}` : `⏱ ${order.orderTime || 'Now'}`}
      </Text>
      <Text style={{ fontSize: 12, color: '#94a3b8', marginBottom: 24 }}>
        Please be ready 5 minutes before order time
      </Text>

      <Text style={{ fontSize: 16, color: '#334155', marginBottom: 8 }}>
        👥 {order.joinedCount} / {order.maxPeople} people
      </Text>
      {order.pricePerPerson != null && order.pricePerPerson > 0 ? (
        <Text style={{ fontSize: 16, color: '#22c55e', marginBottom: 8 }}>
          ${order.pricePerPerson.toFixed(2)} per person
        </Text>
      ) : null}

      <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569', marginTop: 16, marginBottom: 8 }}>
        Participants
      </Text>
      <View
        style={{
          backgroundColor: '#f8fafc',
          padding: 16,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#e2e8f0',
        }}
      >
        {order.participants.length === 0 ? (
          <Text style={{ color: '#94a3b8', fontSize: 14 }}>No participants yet</Text>
        ) : (
          order.participants.map((pid, i) => {
            const participantUid = order.participantUids[i] ?? '';
            const isSelf = participantUid === uid;
            return (
              <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: i < order.participants.length - 1 ? 6 : 0 }}>
                <Text style={{ color: '#475569', fontSize: 14 }}>• {pid}</Text>
                {isParticipant && !isSelf && participantUid ? (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('Report & Block', 'Report and block this user? They won\'t be able to message you or join orders with you.', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Report',
                          style: 'destructive',
                          onPress: () => reportAndBlock(uid, participantUid, id ?? '').then(() => Alert.alert('Done', 'User reported and blocked')),
                        },
                      ]);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: '#dc2626' }}>Report</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 24 }}>Order ID: {id}</Text>
    </SafeAreaView>
  );
}
