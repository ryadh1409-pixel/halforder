import { goBackFromProfileScreen } from '@/lib/profileBack';
import {
  markSupportReadByCustomer,
  sendCustomerSupportMessage,
  setSupportTyping,
  subscribeCustomerSupportConversation,
  subscribeSupportConversationMessages,
  type SupportConversation,
  type SupportConversationMessage,
} from '@/services/supportConversations';
import { useAuth } from '@/services/AuthContext';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'support@halforder.app';
const HALFORDER_AVATAR =
  'https://ui-avatars.com/api/?name=HalfOrder&background=A855F7&color=fff&size=128';

function formatMessageTime(ms: number | null): string {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function MessageBubble({ item }: { item: SupportConversationMessage }) {
  const isCustomer = item.sender === 'customer';
  const isSystem = item.sender === 'system' || item.kind === 'complaint';
  if (isSystem && item.kind === 'complaint') {
    return (
      <View style={styles.complaintBubble}>
        <Text style={styles.complaintLabel}>Complaint submitted</Text>
        <Text style={styles.bubbleBody}>{item.body}</Text>
        <Text style={styles.bubbleTime}>{formatMessageTime(item.createdAtMs)}</Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.bubble,
        isCustomer ? styles.bubbleCustomer : styles.bubbleSupport,
      ]}
    >
      <Text style={styles.bubbleBody}>{item.body}</Text>
      <Text style={styles.bubbleTime}>{formatMessageTime(item.createdAtMs)}</Text>
    </View>
  );
}

export default function CustomerSupportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }
    const unsubMeta = subscribeCustomerSupportConversation(uid, (row) => {
      setConversation(row);
      setLoading(false);
    });
    const unsubMsg = subscribeSupportConversationMessages(uid, (rows) => {
      setMessages(rows);
      setLoading(false);
    });
    void markSupportReadByCustomer(uid).catch(() => {});
    return () => {
      unsubMeta();
      unsubMsg();
    };
  }, [uid]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages.length]);

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (!uid) return;
    void setSupportTyping(uid, 'customer', true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void setSupportTyping(uid, 'customer', false);
    }, 2000);
  };

  const send = async () => {
    if (!uid || !draft.trim()) return;
    setSending(true);
    try {
      await sendCustomerSupportMessage({ body: draft });
      setDraft('');
      void setSupportTyping(uid, 'customer', false);
      showSuccess('Message sent');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not send message'));
    } finally {
      setSending(false);
    }
  };

  if (!uid) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => goBackFromProfileScreen(router)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Customer Support</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>Sign in to chat with HalfOrder Support.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const showTyping = conversation?.adminTyping === true;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => goBackFromProfileScreen(router)} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <Image source={{ uri: HALFORDER_AVATAR }} style={styles.headerAvatar} />
        <View style={styles.headerMeta}>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerTitle}>HalfOrder Support</Text>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#A855F7" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          </View>
          <Text style={styles.headerSub}>We typically reply within a few hours</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#A855F7" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color="#7D8493" />
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptyBody}>
              Tell us how we can help. Your messages are saved here so you can
              pick up anytime.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <MessageBubble item={item} />}
            ListFooterComponent={
              showTyping ? (
                <View style={styles.typingRow}>
                  <ActivityIndicator size="small" color="#A855F7" />
                  <Text style={styles.typingText}>HalfOrder Support is typing…</Text>
                </View>
              ) : null
            }
          />
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            placeholder="Type your message…"
            placeholderTextColor="#7D8493"
            style={styles.input}
            multiline
            maxLength={4000}
          />
          <Pressable
            style={[styles.sendBtn, (sending || !draft.trim()) && { opacity: 0.5 }]}
            onPress={() => void send()}
            disabled={sending || !draft.trim()}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={20} color="#FFF" />
            )}
          </Pressable>
        </View>

        <Pressable
          style={styles.emailFooter}
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        >
          <Text style={styles.emailFooterText}>
            Additional contact: {SUPPORT_EMAIL}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerAvatar: { width: 44, height: 44, borderRadius: 22 },
  headerMeta: { flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  headerTitle: { color: '#FFF', fontWeight: '800', fontSize: 17 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { color: '#A855F7', fontWeight: '700', fontSize: 12 },
  headerSub: { color: '#B7BDC9', fontSize: 12, marginTop: 2, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#B7BDC9', textAlign: 'center', fontSize: 15 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyTitle: { color: '#FFF', fontWeight: '800', fontSize: 18 },
  emptyBody: {
    color: '#B7BDC9',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
    fontSize: 14,
  },
  list: { padding: 16, paddingBottom: 8 },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  bubbleCustomer: {
    alignSelf: 'flex-end',
    backgroundColor: '#A855F7',
  },
  bubbleSupport: {
    alignSelf: 'flex-start',
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  complaintBubble: {
    alignSelf: 'center',
    maxWidth: '95%',
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  complaintLabel: {
    color: '#A855F7',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bubbleBody: { color: '#FFF', fontSize: 15, lineHeight: 21, fontWeight: '500' },
  bubbleTime: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 6,
    fontWeight: '600',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  typingText: { color: '#B7BDC9', fontSize: 13, fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#171923',
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#A855F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailFooter: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emailFooterText: {
    color: '#7D8493',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
