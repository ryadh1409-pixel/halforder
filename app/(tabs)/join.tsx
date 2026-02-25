import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatTorontoOrderTime } from '@/lib/format-toronto-time';
import { hasBlockConflict } from '@/services/report-block';
import { auth, db } from '../../services/firebase';

const ANON_ID_KEY = '@join_anon_id';

async function getOrCreateAnonId(): Promise<string> {
  let id = await AsyncStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = 'anon_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    await AsyncStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

type OpenOrder = {
  id: string;
  maxPeople: number;
  joinedCount: number;
  participants: string[];
  foodType: string;
  restaurantName: string;
  restaurantLocation: string;
  orderTime: string;
  orderAtMs: number | null;
  createdAt: number;
  pricePerPerson: number | null;
};

const FOOD_EMOJI: Record<string, string> = {
  pizza: '🍕',
  noodles: '🍜',
};

async function joinOrder(
  orderId: string,
  anonId: string,
  authUid: string
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const orderSnap = await getDoc(orderRef);

  if (!orderSnap.exists()) {
    throw new Error('Order not found');
  }

  const data = orderSnap.data();
  const maxPeople = Number(data?.maxPeople ?? 0);
  const joinedCount = Number(data?.joinedCount ?? 0);
  const participants: string[] = Array.isArray(data?.participants)
    ? data.participants
    : [];

  if (joinedCount >= maxPeople) {
    throw new Error('Order is full');
  }

  if (participants.includes(anonId)) {
    throw new Error('Already joined');
  }

  const newJoinedCount = joinedCount + 1;
  const status: 'open' | 'matched' = newJoinedCount === maxPeople ? 'matched' : 'open';

  await updateDoc(orderRef, {
    participants: arrayUnion(anonId),
    participantUids: arrayUnion(authUid),
    joinedCount: increment(1),
    status,
  });
}

export default function JoinScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [anonId, setAnonId] = useState<string | null>(null);

  useEffect(() => {
    getOrCreateAnonId().then(setAnonId);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'open')
    );
    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: OpenOrder[] = snap.docs.map((d) => {
          const d2 = d.data();
          const created = d2?.createdAt?.toMillis?.() ?? d2?.createdAt ?? 0;
          return {
            id: d.id,
            maxPeople: Number(d2?.maxPeople ?? 0),
            joinedCount: Number(d2?.joinedCount ?? 0),
            participants: Array.isArray(d2?.participants) ? d2.participants : [],
            foodType: typeof d2?.foodType === 'string' ? d2.foodType : 'pizza',
            restaurantName:
              typeof d2?.restaurantName === 'string' && d2.restaurantName.trim()
                ? d2.restaurantName
                : 'Not specified',
            restaurantLocation: typeof d2?.restaurantLocation === 'string' ? d2.restaurantLocation : '',
            orderTime: typeof d2?.orderTime === 'string' ? d2.orderTime : 'Now',
            orderAtMs: d2?.orderAt?.toMillis?.() ?? d2?.orderAt ?? null,
            createdAt: Number(created),
            pricePerPerson: typeof d2?.pricePerPerson === 'number' ? d2.pricePerPerson : null,
          };
        });
        setOrders(list);
      },
      () => setOrders([])
    );
    setLoading(false);
    return () => unsubscribe();
  }, []);

  const displayOrders = useMemo(() => {
    const notFull = orders.filter((o) => o.joinedCount < o.maxPeople);
    return [...notFull].sort((a, b) => {
      const aAt = a.orderAtMs ?? Infinity;
      const bAt = b.orderAtMs ?? Infinity;
      return aAt - bAt;
    });
  }, [orders]);

  const handleJoin = async (orderId: string) => {
    let anonId: string;
    try {
      anonId = await getOrCreateAnonId();
    } catch {
      Alert.alert('Error', 'Could not get device id');
      return;
    }

    const authUid = auth.currentUser?.uid ?? '';
    if (!authUid) {
      Alert.alert('Error', 'You must be signed in to join.');
      return;
    }
    setJoiningId(orderId);
    try {
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      const participantUids: string[] = Array.isArray(orderSnap.data()?.participantUids) ? orderSnap.data()!.participantUids : [];
      if (await hasBlockConflict(authUid, participantUids)) {
        Alert.alert('Cannot join', 'You cannot join this order due to a block.');
        return;
      }
      const order = orders.find((o) => o.id === orderId);
      await joinOrder(orderId, anonId, authUid);
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        type: 'system',
        text: 'User joined the order',
        senderId: '',
        createdAt: serverTimestamp(),
      });
      const becameMatched = order != null && order.joinedCount + 1 === order.maxPeople;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, participants: [...o.participants, anonId], joinedCount: o.joinedCount + 1 }
            : o
        )
      );
      Alert.alert('Success', 'Joined successfully');
      if (becameMatched) {
        router.push(`/order/${orderId}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      if (msg === 'Order is full') {
        Alert.alert('Order full', 'Order is full');
      } else if (msg === 'Already joined') {
        Alert.alert('Already joined', 'Already joined');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setJoiningId(null);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: '#22223b', marginTop: 16, marginBottom: 24 }}>
        Join Order
      </Text>

      <FlatList
        data={displayOrders}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={{ color: '#666', marginTop: 16 }}>No open orders</Text>
        }
        renderItem={({ item }) => {
          const alreadyJoined = anonId != null && item.participants.includes(anonId);
          const joining = joiningId === item.id;
          const foodType = (item.foodType || 'pizza').toLowerCase();
          const foodLabel = foodType.charAt(0).toUpperCase() + foodType.slice(1);
          const restaurantLabel =
            !item.restaurantName || item.restaurantName.trim() === '' || item.restaurantName === 'Not specified'
              ? 'Unknown restaurant'
              : item.restaurantName;
          const accentColor =
            foodType === 'pizza' ? '#f97316' : foodType === 'noodles' ? '#eab308' : '#9ca3af';
          const almostFull = !alreadyJoined && item.maxPeople - item.joinedCount === 1;

          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 16,
                paddingHorizontal: 18,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderLeftWidth: 6,
                borderLeftColor: accentColor,
                borderRadius: 10,
                marginBottom: 14,
              }}
            >
              <View>
                <Text style={{ color: '#334155', fontSize: 26, fontWeight: '700' }}>
                  {(FOOD_EMOJI[foodType] ?? '🍽️') + ' ' + foodLabel}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 14 }}>
                  {restaurantLabel}
                </Text>
                {item.restaurantLocation ? (
                  <Text style={{ color: '#64748b', fontSize: 13 }}>
                    📍 {item.restaurantLocation}
                  </Text>
                ) : null}
                <Text style={{ color: '#64748b', fontSize: 13 }}>
                  {item.orderAtMs != null ? `⏰ ${formatTorontoOrderTime(item.orderAtMs)}` : `⏱ ${item.orderTime || 'Now'}`}
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                  Please be ready 5 minutes before order time
                </Text>
                <Text style={{ color: '#64748b', fontSize: 14 }}>
                  👥 {item.joinedCount} / {item.maxPeople} people
                </Text>
                {item.pricePerPerson != null && item.pricePerPerson > 0 ? (
                  <Text style={{ color: '#22c55e', fontSize: 14, marginTop: 2 }}>
                    ${item.pricePerPerson.toFixed(2)} per person
                  </Text>
                ) : null}
                {almostFull && (
                  <Text style={{ color: '#ea580c', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                    🔥 Almost full
                  </Text>
                )}
                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                  {item.id}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleJoin(item.id)}
                disabled={alreadyJoined || !!joiningId}
                style={{
                  backgroundColor: alreadyJoined ? '#9ca3af' : '#2563eb',
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                }}
              >
                {joining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>
                    {alreadyJoined ? 'Joined ✅' : 'Join'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
