import { useLocalSearchParams } from 'expo-router';
import {
  arrayUnion,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatTorontoTime } from '@/lib/format-toronto-time';
import { auth, db } from '@/services/firebase';
import { isBlockedByAny } from '@/services/report-block';

type Message = {
  id: string;
  text: string;
  senderId: string;
  createdAt: number;
  seenBy: string[];
  type: 'user' | 'system';
};

export default function OrderChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = id ?? '';
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [typingUids, setTypingUids] = useState<Record<string, boolean>>({});
  const [orderStatus, setOrderStatus] = useState<string>('');
  const [participantUids, setParticipantUids] = useState<string[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const isClosed = orderStatus === 'closed';

  const setTyping = (value: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !orderId || !allowed) return;
    const orderRef = doc(db, 'orders', orderId);
    updateDoc(orderRef, { [`typing.${uid}`]: value }).catch(() => {});
  };

  useEffect(() => {
    if (!orderId) return;

    const orderRef = doc(db, 'orders', orderId);
    const messagesPath = collection(db, 'orders', orderId, 'messages');
    const messagesQuery = query(messagesPath, orderBy('createdAt', 'asc'));

    let cancelled = false;

    const unsubOrder = onSnapshot(orderRef, (orderSnap) => {
      if (cancelled) return;
      if (!orderSnap.exists()) {
        setAllowed(false);
        setLoading(false);
        return;
      }
      const d = orderSnap.data();
      const uids: string[] = Array.isArray(d?.participantUids) ? d.participantUids : [];
      const uid = auth.currentUser?.uid ?? '';
      setAllowed(uid !== '' && uids.includes(uid));
      setParticipantUids(uids);
      const typing = d?.typing;
      setTypingUids(typeof typing === 'object' && typing !== null ? (typing as Record<string, boolean>) : {});
      setOrderStatus(typeof d?.status === 'string' ? d.status : '');
      setLoading(false);
    }, () => {
      if (!cancelled) { setAllowed(false); setLoading(false); }
    });

    const unsub = onSnapshot(
      messagesQuery,
      (snap) => {
        if (cancelled) return;
        const list: Message[] = snap.docs.map((d) => {
          const d2 = d.data();
          const created = d2?.createdAt?.toMillis?.() ?? d2?.createdAt ?? 0;
          const seenBy = Array.isArray(d2?.seenBy) ? d2.seenBy : [];
          const type = d2?.type === 'system' ? 'system' : 'user';
          return {
            id: d.id,
            text: typeof d2?.text === 'string' ? d2.text : '',
            senderId: typeof d2?.senderId === 'string' ? d2.senderId : '',
            createdAt: Number(created),
            seenBy,
            type,
          };
        });
        setMessages(list);
      },
      () => {
        if (!cancelled) setMessages([]);
      }
    );

    return () => {
      cancelled = true;
      unsubOrder();
      unsub();
    };
  }, [orderId]);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  useEffect(() => {
    const uid = auth.currentUser?.uid ?? '';
    if (!uid || !orderId || !allowed || messages.length === 0) return;
    const toMark = messages.filter((m) => m.type === 'user' && !m.seenBy.includes(uid));
    toMark.forEach((m) => {
      const msgRef = doc(db, 'orders', orderId, 'messages', m.id);
      updateDoc(msgRef, { seenBy: arrayUnion(uid) }).catch(() => {});
    });
  }, [orderId, allowed, messages.map((m) => m.id).join(','), messages.map((m) => m.seenBy.join(',')).join('|')]);

  useEffect(() => {
    const uid = auth.currentUser?.uid ?? '';
    if (!uid || participantUids.length === 0) return;
    const others = participantUids.filter((u) => u !== uid);
    isBlockedByAny(uid, others).then(setIsBlocked);
  }, [participantUids.join(',')]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !orderId || !allowed || sending || isClosed || isBlocked) return;

    const uid = auth.currentUser?.uid ?? '';
    if (!uid) return;

    setSending(true);
    try {
      const messagesPath = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesPath, {
        text: trimmed,
        senderId: uid,
        createdAt: serverTimestamp(),
      });
      setText('');
      Keyboard.dismiss();
      setTyping(false);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: '#64748b', textAlign: 'center' }}>
          You must be a participant to use chat.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['bottom']}>
      {isBlocked ? (
        <View style={{ padding: 12, backgroundColor: '#fef2f2' }}>
          <Text style={{ fontSize: 14, color: '#b91c1c', textAlign: 'center' }}>You cannot send messages</Text>
        </View>
      ) : null}
      {isClosed ? (
        <View style={{ padding: 12, backgroundColor: '#fef2f2' }}>
          <Text style={{ fontSize: 14, color: '#b91c1c', textAlign: 'center' }}>Chat closed</Text>
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          ListEmptyComponent={
            <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 24 }}>
              No messages yet. Say hi!
            </Text>
          }
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            if (item.type === 'system') {
              return (
                <View style={{ width: '100%' }}>
                  <View style={{ alignSelf: 'center', marginVertical: 8, paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 13, color: '#94a3b8' }}>{item.text}</Text>
                  </View>
                </View>
              );
            }
            const isMine = item.senderId === auth.currentUser?.uid;
            const isLast = item.id === messages[messages.length - 1]?.id;
            const showSeen = isLast && item.seenBy.length > 0;
            return (
              <View style={{ width: '100%' }}>
                <View
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    paddingHorizontal: 8,
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: isMine ? '#2563eb' : '#f1f5f9',
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                    }}
                  >
                  <Text style={{ color: isMine ? '#fff' : '#334155', fontSize: 14 }}>
                    {item.text}
                  </Text>
                  <Text style={{ color: isMine ? 'rgba(255,255,255,0.8)' : '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    {formatTorontoTime(item.createdAt)}
                  </Text>
                  {showSeen ? (
                    <Text style={{ color: isMine ? '#fff' : '#64748b', fontSize: 11, marginTop: 2, opacity: 0.9 }}>
                      Seen
                    </Text>
                  ) : null}
                  </View>
                </View>
              </View>
            );
          }}
        />

        {(() => {
          const uid = auth.currentUser?.uid ?? '';
          const otherTyping = Object.entries(typingUids).some(([u, v]) => u !== uid && v === true);
          return otherTyping ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#f8fafc' }}>
              <Text style={{ fontSize: 13, color: '#64748b' }}>Someone is typing...</Text>
            </View>
          ) : null;
        })()}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: '#e2e8f0',
            backgroundColor: '#fff',
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            placeholder="Type a message..."
            placeholderTextColor="#94a3b8"
            selectionColor="#2563eb"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 24,
              paddingVertical: 10,
              paddingHorizontal: 16,
              fontSize: 15,
              color: '#1e293b',
            }}
            editable={!sending && !isClosed && !isBlocked}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sending || isClosed || isBlocked}
            style={{
              marginLeft: 8,
              backgroundColor: text.trim() && !sending && !isClosed && !isBlocked ? '#2563eb' : '#cbd5e1',
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 24,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
