import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ACCENT = '#34D399';
const D = {
  bg: '#06080C',
  card: '#0D1219',
  border: 'rgba(255,255,255,0.1)',
  text: '#F8FAFC',
  muted: 'rgba(248,250,252,0.55)',
};

type ChatUserData = {
  uid: string;
  name?: string;
  avatar?: string | null;
};

type ChatItem = {
  id: string;
  users: string[];
  usersData?: ChatUserData[];
  orderId?: string;
  createdAt?: Timestamp | number;
  lastMessage?: string;
  lastMessageAt?: Timestamp | number;
  unreadCount?: number;
};

type LastMessageMap = Record<
  string,
  { text: string; createdAt?: Timestamp | number }
>;
type AiRow = { id: string; role: 'user' | 'assistant'; text: string };

export default function ChatTabScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [lastMessages, setLastMessages] = useState<LastMessageMap>({});
  const [loading, setLoading] = useState(true);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRows, setAiRows] = useState<AiRow[]>([]);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      setChats([]);
      return;
    }
    const q = query(collection(db, 'chats'), where('users', 'array-contains', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChatItem[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            users: Array.isArray(data?.users) ? (data.users as string[]) : [],
            usersData: Array.isArray(data?.usersData)
              ? (data.usersData as ChatUserData[])
              : [],
            orderId: typeof data?.orderId === 'string' ? data.orderId : '',
            createdAt: data?.createdAt,
            lastMessage:
              typeof data?.lastMessage === 'string' ? data.lastMessage : '',
            lastMessageAt: data?.lastMessageAt ?? data?.createdAt,
            unreadCount:
              typeof data?.unreadCount === 'number' ? data.unreadCount : 0,
          });
        });
        list.sort((a, b) => {
          const ma =
            typeof a.lastMessageAt === 'number'
              ? a.lastMessageAt
              : a.lastMessageAt?.toMillis?.() ?? 0;
          const mb =
            typeof b.lastMessageAt === 'number'
              ? b.lastMessageAt
              : b.lastMessageAt?.toMillis?.() ?? 0;
          return mb - ma;
        });
        setChats(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [uid]);

  const getLastMessage = async (chatId: string) => {
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(1),
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data() as { text?: string; createdAt?: Timestamp };
    }
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    async function loadLastMessages() {
      const missing = chats.filter((chat) => !chat.lastMessage);
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(async (chat) => {
          const data = await getLastMessage(chat.id);
          return [
            chat.id,
            {
              text: data?.text ?? '',
              createdAt: data?.createdAt,
            },
          ] as const;
        }),
      );
      if (!cancelled) {
        setLastMessages((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    }
    void loadLastMessages();
    return () => {
      cancelled = true;
    };
  }, [chats]);

  const formatTime = (timestamp?: Timestamp | number) => {
    if (!timestamp) return '';
    const baseDate =
      typeof timestamp === 'number'
        ? new Date(timestamp)
        : timestamp.toDate();
    const zoned = toZonedTime(baseDate, 'America/Toronto');
    return format(zoned, 'h:mm a');
  };

  const getOtherUser = (chat: ChatItem, currentUserId: string) => {
    return chat.usersData?.find((u) => u.uid !== currentUserId);
  };

  const sendMessage = async (message: string) => {
    try {
      const res = await fetch('http://localhost:3000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      return data.response as string;
    } catch (error) {
      console.error(error);
      return 'Error connecting to AI';
    }
  };

  const handleSendAiMessage = async () => {
    const text = aiInput.trim();
    if (!text || aiLoading) return;
    setAiRows((prev) => [...prev, { id: `${Date.now()}-u`, role: 'user', text }]);
    setAiInput('');
    setAiLoading(true);
    const reply = await sendMessage(text);
    setAiRows((prev) => [
      ...prev,
      { id: `${Date.now()}-a`, role: 'assistant', text: reply || 'No response' },
    ]);
    setAiLoading(false);
  };

  const viewData = useMemo(() => {
    return chats.map((chat) => {
      const otherUser = getOtherUser(chat, uid ?? '');
      const loadedLast = lastMessages[chat.id];
      const preview = chat.lastMessage || loadedLast?.text || 'Start chatting...';
      const timeSource = chat.lastMessageAt ?? loadedLast?.createdAt ?? chat.createdAt;
      return {
        ...chat,
        otherUser,
        preview,
        timeLabel: formatTime(timeSource),
      };
    });
  }, [chats, lastMessages, uid]);

  if (!uid) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.hint}>Sign in to view your messages.</Text>
          <TouchableOpacity
            style={styles.signInBtn}
            onPress={() =>
              router.push('/(auth)/login?redirectTo=/(tabs)/chat')
            }
          >
            <Text style={styles.signInBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <ScreenFadeIn style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>
        <View style={styles.aiCard}>
          <Text style={styles.aiTitle}>AI Assistant</Text>
          <View style={styles.aiInputRow}>
            <TextInput
              value={aiInput}
              onChangeText={setAiInput}
              placeholder="Ask support..."
              placeholderTextColor={D.muted}
              style={styles.aiInput}
              editable={!aiLoading}
              returnKeyType="send"
              onSubmitEditing={handleSendAiMessage}
            />
            <TouchableOpacity
              style={[styles.aiSendBtn, aiLoading && styles.aiSendBtnDisabled]}
              onPress={handleSendAiMessage}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <ActivityIndicator size="small" color={D.text} />
              ) : (
                <Text style={styles.aiSendText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
          {aiRows.length > 0 ? (
            <View style={styles.aiMessages}>
              {aiRows.slice(-4).map((row) => (
                <Text
                  key={row.id}
                  style={[
                    styles.aiMsg,
                    row.role === 'user' ? styles.aiMsgUser : styles.aiMsgAssistant,
                  ]}
                >
                  {row.role === 'user' ? 'You: ' : 'AI: '}
                  {row.text}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        {loading ? (
          <View style={styles.skeletonWrap}>
            <ShimmerSkeleton
              width="100%"
              height={70}
              borderRadius={16}
              style={styles.skeletonItem}
            />
            <ShimmerSkeleton
              width="100%"
              height={70}
              borderRadius={16}
              style={styles.skeletonItem}
            />
            <ShimmerSkeleton width="100%" height={70} borderRadius={16} />
            <ActivityIndicator
              size="small"
              color={ACCENT}
              style={{ marginTop: 14 }}
            />
          </View>
        ) : viewData.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No messages</Text>
            <Text style={styles.emptyHint}>
              New order chats and updates will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={viewData}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.chatItem}
                activeOpacity={0.85}
                onPress={() => router.push(`/chat/${item.id}` as const)}
              >
                <Image
                  source={{ uri: item.otherUser?.avatar || 'https://via.placeholder.com/50' }}
                  style={styles.avatar}
                  contentFit="cover"
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.otherUser?.name || 'User'}
                  </Text>
                  <Text style={styles.lastMessage} numberOfLines={1}>
                    {item.preview}
                  </Text>
                </View>

                <View style={styles.rightSide}>
                  <Text style={styles.time}>{item.timeLabel}</Text>
                  {(item.unreadCount ?? 0) > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: D.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: D.text,
  },
  aiCard: {
    margin: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: 14,
    backgroundColor: D.card,
    padding: 12,
  },
  aiTitle: {
    color: D.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  aiInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: D.text,
    fontSize: 14,
    backgroundColor: '#0A0F15',
  },
  aiSendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: ACCENT,
  },
  aiSendBtnDisabled: {
    opacity: 0.7,
  },
  aiSendText: {
    color: D.bg,
    fontWeight: '700',
    fontSize: 13,
  },
  aiMessages: {
    marginTop: 10,
    gap: 6,
  },
  aiMsg: {
    fontSize: 13,
    lineHeight: 18,
  },
  aiMsgUser: {
    color: '#CDEBFF',
  },
  aiMsgAssistant: {
    color: '#D1FAE5',
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 32,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.3,
    borderColor: '#333',
    backgroundColor: D.bg,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: D.card,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  lastMessage: {
    color: '#AAAAAA',
    fontSize: 14,
    marginTop: 2,
  },
  rightSide: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 64,
  },
  time: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  badge: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 48,
  },
  emptyText: {
    fontSize: 16,
    color: D.muted,
    marginTop: 6,
    fontWeight: '700',
  },
  emptyIcon: {
    fontSize: 26,
    marginBottom: 2,
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    color: D.muted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  skeletonWrap: {
    padding: 16,
    paddingTop: 22,
  },
  skeletonItem: {
    marginBottom: 10,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  hint: {
    fontSize: 16,
    color: D.muted,
    textAlign: 'center',
  },
  signInBtn: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  signInBtnText: {
    color: '#A7F3D0',
    fontWeight: '700',
    fontSize: 16,
  },
});
