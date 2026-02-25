import { useRouter } from 'expo-router';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatTorontoOrderTime } from '@/lib/format-toronto-time';
import { auth, db } from '../../services/firebase';

type JoinedOrder = {
  id: string;
  foodType: string;
  restaurantName: string;
  restaurantLocation: string;
  orderTime: string;
  orderAtMs: number | null;
  status: string;
};

export default function ChatListScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<JoinedOrder[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid ?? '';
    if (!uid) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('participantUids', 'array-contains', uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: JoinedOrder[] = snap.docs.map((d) => {
          const data = d.data();
          const orderAt = data?.orderAt?.toMillis?.() ?? data?.orderAt ?? null;
          return {
            id: d.id,
            foodType: typeof data?.foodType === 'string' ? data.foodType : 'pizza',
            restaurantName:
              typeof data?.restaurantName === 'string' && data.restaurantName.trim()
                ? data.restaurantName
                : 'Not specified',
            restaurantLocation: typeof data?.restaurantLocation === 'string' ? data.restaurantLocation : '',
            orderTime: typeof data?.orderTime === 'string' ? data.orderTime : 'Now',
            orderAtMs: orderAt,
            status: typeof data?.status === 'string' ? data.status : 'open',
          };
        });
        list.sort((a, b) => (a.orderAtMs ?? 0) - (b.orderAtMs ?? 0));
        setOrders(list);
        setLoading(false);
      },
      () => {
        setOrders([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    if (orders.length === 0) {
      setLastMessages({});
      return;
    }
    let cancelled = false;
    Promise.all(
      orders.map(async (o) => {
        const q = query(
          collection(db, 'orders', o.id, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        const text = snap.empty ? '' : (snap.docs[0].data()?.text ?? '');
        return { orderId: o.id, text } as const;
      })
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      results.forEach(({ orderId, text }) => { map[orderId] = text; });
      setLastMessages(map);
    });
    return () => { cancelled = true; };
  }, [orders.map((o) => o.id).join(',')]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 24, paddingBottom: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#22223b' }}>Your Chats</Text>
        <Text style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
          Orders you&apos;ve joined
        </Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ color: '#94a3b8', fontSize: 16, textAlign: 'center' }}>
              You haven&apos;t joined any orders yet
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const preview = lastMessages[item.id];
          const previewText = preview && preview.trim() ? preview.trim().slice(0, 50) + (preview.length > 50 ? '…' : '') : null;
          return (
            <View
              style={{
                backgroundColor: '#f8fafc',
                padding: 16,
                borderRadius: 12,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#e2e8f0',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#334155', marginBottom: 4 }}>
                {item.restaurantName}
              </Text>
              <Text style={{ fontSize: 14, color: '#64748b', marginBottom: previewText ? 4 : 12 }}>
                {item.orderAtMs != null ? formatTorontoOrderTime(item.orderAtMs) : item.orderTime}
              </Text>
              {previewText ? (
                <Text style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }} numberOfLines={1}>
                  {previewText}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => router.push(`/order/${item.id}/chat`)}
                style={{
                  backgroundColor: '#2563eb',
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Open Chat</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
