import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { hasBlockBetween } from '@/services/blocks';
import { auth, db } from '@/services/firebase';

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  userName: string;
  createdAtMs: number;
  delivered: boolean;
  seen: boolean;
  system: boolean;
};

export default function OrderChatScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const chatId = String(orderId ?? '');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [typingUid, setTypingUid] = useState<string | null>(null);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNotifiedMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, 'chats', chatId);
    const unsub = onSnapshot(chatRef, (snap) => {
      if (!snap.exists()) {
        setError('Chat not found.');
        setLoading(false);
        return;
      }
      const uid = auth.currentUser?.uid ?? '';
      const users = Array.isArray(snap.data()?.users)
        ? (snap.data()?.users as string[])
        : [];
      const partner = users.find((u) => u !== uid) ?? null;
      setOtherUserId(partner);
      const typingValue = snap.data()?.typing;
      setTypingUid(typeof typingValue === 'string' ? typingValue : null);
      setError(null);
    });
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !otherUserId || uid === otherUserId) {
      setBlocked(false);
      return;
    }
    let cancelled = false;
    hasBlockBetween(uid, otherUserId)
      .then((v) => {
        if (!cancelled) setBlocked(v);
      })
      .catch(() => {
        if (!cancelled) setBlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [otherUserId]);

  useEffect(() => {
    if (!chatId || blocked) {
      setLoading(false);
      if (blocked) setMessages([]);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChatMessage[] = snap.docs.map((d) => {
          const data = d.data();
          const ms = data?.createdAt?.toMillis?.() ?? data?.createdAt ?? Date.now();
          return {
            id: d.id,
            text: String(data?.text ?? ''),
            senderId: String(data?.senderId ?? data?.userId ?? ''),
            userName: String(data?.userName ?? 'User'),
            createdAtMs: Number(ms),
            delivered: data?.delivered !== false,
            seen: data?.seen === true,
            system: data?.system === true,
          };
        });
        setMessages(list);
        const latest = list[list.length - 1];
        const currentUid = auth.currentUser?.uid ?? '';
        if (
          latest &&
          latest.senderId &&
          latest.senderId !== currentUid &&
          latest.id !== lastNotifiedMessageIdRef.current
        ) {
          lastNotifiedMessageIdRef.current = latest.id;
          Notifications.scheduleNotificationAsync({
            content: {
              title: 'New Message',
              body: latest.text || 'You received a new message',
            },
            trigger: null,
          }).catch(() => {});
        }
        setError(null);
        setLoading(false);
      },
      () => {
        setMessages([]);
        setError('Unable to load chat. Pull to retry by reopening this screen.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [blocked, chatId]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !chatId) return;
    let cancelled = false;
    async function markSeen() {
      try {
        const q = query(
          collection(db, 'chats', chatId, 'messages'),
          where('seen', '==', false),
        );
        const snapshot = await getDocs(q);
        await Promise.all(
          snapshot.docs.map(async (docItem) => {
            const data = docItem.data();
            if (data?.senderId === uid || data?.system === true) return;
            await updateDoc(docItem.ref, {
              seen: true,
              seenAt: serverTimestamp(),
            });
          }),
        );
        await updateDoc(doc(db, 'chats', chatId), { unreadCount: 0 }).catch(() => {});
      } catch {
        if (!cancelled) {
          // ignore seen update failures silently to avoid interrupting chat UX
        }
      }
    }
    void markSeen();
    return () => {
      cancelled = true;
    };
  }, [chatId, messages.length]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !chatId) return;
    if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
    if (text.trim().length > 0) {
      updateDoc(doc(db, 'chats', chatId), { typing: uid }).catch(() => {});
      typingClearTimerRef.current = setTimeout(() => {
        updateDoc(doc(db, 'chats', chatId), { typing: null }).catch(() => {});
      }, 1200);
    } else {
      updateDoc(doc(db, 'chats', chatId), { typing: null }).catch(() => {});
    }
    return () => {
      if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
    };
  }, [chatId, text]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    return () => {
      if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
      if (uid && chatId) {
        updateDoc(doc(db, 'chats', chatId), { typing: null }).catch(() => {});
      }
    };
  }, [chatId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const id = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(id);
  }, [messages.length]);

  const displayName =
    auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'You';

  const canSend = useMemo(
    () => !!chatId && text.trim().length > 0 && !sending && !blocked,
    [blocked, chatId, sending, text],
  );

  const handleSend = async () => {
    if (!canSend) return;
    const uid = auth.currentUser?.uid;
    if (!uid || !chatId) return;
    const payload = text.trim();
    setSending(true);
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: payload,
        senderId: uid,
        userName: displayName,
        system: false,
        createdAt: serverTimestamp(),
        delivered: true,
        seen: false,
      });
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: payload,
        lastMessageAt: serverTimestamp(),
        unreadCount: increment(1),
      });
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'New Message',
          body: payload,
        },
        trigger: null,
      }).catch(() => {});
      setText('');
      Haptics.selectionAsync().catch(() => {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const formatTorontoTime = (ms: number) => {
    const zonedDate = toZonedTime(new Date(ms), 'America/Toronto');
    return format(zonedDate, 'MMM d, yyyy • h:mm a');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenFadeIn style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Order Chat</Text>
          <View style={{ width: 40 }} />
        </View>
        {typingUid && typingUid !== auth.currentUser?.uid ? (
          <Text style={styles.typingText}>Typing...</Text>
        ) : null}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#34D399" />
          </View>
        ) : blocked ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>Chat unavailable</Text>
            <Text style={styles.emptyHint}>
              This conversation is hidden because one user blocked the other.
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyHint}>Start the conversation with your order partners.</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const mine = item.senderId === auth.currentUser?.uid;
              return (
                <View style={[styles.msgBubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={styles.userName}>{item.userName}</Text>
                  <Text style={styles.msgText}>{item.text}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.time}>{formatTorontoTime(item.createdAtMs)}</Text>
                    {!item.system && mine ? (
                      <Text style={styles.statusTick}>{item.seen ? '✓✓' : '✓'}</Text>
                    ) : null}
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a message..."
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Text style={styles.sendBtnText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        </KeyboardAvoidingView>
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D10' },
  header: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: '#1F2937',
    borderBottomWidth: 1,
  },
  back: { color: '#34D399', fontSize: 15, fontWeight: '700' },
  title: { color: '#F8FAFC', fontSize: 17, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 12, paddingBottom: 20 },
  msgBubble: {
    maxWidth: '80%',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: '#10241D', borderColor: '#1E3A2F', borderWidth: 1 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#141922', borderColor: '#232A35', borderWidth: 1 },
  userName: { color: '#6EE7B7', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  msgText: { color: '#F3F4F6', fontSize: 14 },
  time: { color: '#9CA3AF', fontSize: 11, marginTop: 6, textAlign: 'right' },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
  },
  statusTick: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '700',
  },
  typingText: {
    color: '#AAAAAA',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopColor: '#1F2937',
    borderTopWidth: 1,
    backgroundColor: '#0F141B',
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232A35',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    backgroundColor: '#141922',
  },
  sendBtn: {
    minHeight: 44,
    minWidth: 68,
    borderRadius: 12,
    backgroundColor: '#34D399',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#052E1A', fontWeight: '800', fontSize: 14 },
  emptyTitle: { color: '#F3F4F6', fontSize: 18, fontWeight: '700' },
  emptyHint: { color: '#9CA3AF', fontSize: 13, marginTop: 6, textAlign: 'center' },
  errorText: { color: '#FCA5A5', marginTop: 8, fontSize: 12 },
  errorBanner: {
    color: '#FCA5A5',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 8,
    backgroundColor: '#1A1113',
  },
});
