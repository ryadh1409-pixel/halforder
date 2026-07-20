import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  closeSupportConversation,
  markSupportReadByAdmin,
  reopenSupportConversation,
  resolveSupportConversation,
  sendAdminSupportReply,
  setSupportTyping,
  statusLabel,
  subscribeSupportConversation,
  subscribeSupportConversationMessages,
  type SupportConversation,
  type SupportConversationMessage,
} from '@/services/supportConversations';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatWhen(ms: number | null): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function AdminSupportThreadScreen() {
  const router = useRouter();
  const { threadId: threadParam } = useLocalSearchParams<{ threadId?: string }>();
  const conversationId = typeof threadParam === 'string' ? threadParam : '';
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId) return undefined;
    void markSupportReadByAdmin(conversationId).catch(() => {});
    const unsubMeta = subscribeSupportConversation(conversationId, setConversation);
    const unsubMsg = subscribeSupportConversationMessages(conversationId, setMessages);
    return () => {
      unsubMeta();
      unsubMsg();
    };
  }, [conversationId]);

  const send = async () => {
    if (!conversationId || !draft.trim()) return;
    setSending(true);
    try {
      await sendAdminSupportReply(conversationId, draft);
      setDraft('');
      void setSupportTyping(conversationId, 'admin', false);
      showSuccess('Reply sent.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not send reply.'));
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (!conversationId) return;
    void setSupportTyping(conversationId, 'admin', true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void setSupportTyping(conversationId, 'admin', false);
    }, 2000);
  };

  const complaintMessage = messages.find((m) => m.kind === 'complaint');

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title={conversation?.userName ?? 'Conversation'}
        subtitle={statusLabel(conversation?.status ?? 'open')}
        fallbackRoute={adminRoutes.supportInbox}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionBar}>
        <Pressable
          style={styles.actionChip}
          onPress={() =>
            void closeSupportConversation(conversationId)
              .then(() => showSuccess('Conversation closed.'))
              .catch((e) => showError(getReadableErrorMessageOr(e, 'Failed.')))
          }
        >
          <Text style={styles.actionChipText}>Close</Text>
        </Pressable>
        <Pressable
          style={styles.actionChip}
          onPress={() =>
            void reopenSupportConversation(conversationId)
              .then(() => showSuccess('Conversation reopened.'))
              .catch((e) => showError(getReadableErrorMessageOr(e, 'Failed.')))
          }
        >
          <Text style={styles.actionChipText}>Reopen</Text>
        </Pressable>
        <Pressable
          style={styles.actionChip}
          onPress={() =>
            void resolveSupportConversation(conversationId)
              .then(() => showSuccess('Marked resolved.'))
              .catch((e) => showError(getReadableErrorMessageOr(e, 'Failed.')))
          }
        >
          <Text style={styles.actionChipText}>Mark resolved</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Customer information</Text>
        <Text style={styles.infoLine}>Name: {conversation?.userName ?? '—'}</Text>
        <Text style={styles.infoLine}>Email: {conversation?.userEmail ?? '—'}</Text>
        <Text style={styles.infoLine}>UID: {conversation?.userId ?? conversationId}</Text>
        {conversation?.orderId ? (
          <Pressable onPress={() => router.push(adminRoutes.order(conversation.orderId!) as never)}>
            <Text style={styles.infoLink}>Order: {conversation.orderId}</Text>
          </Pressable>
        ) : (
          <Text style={styles.infoLine}>Order: —</Text>
        )}
        {conversation?.paymentId ? (
          <Pressable
            onPress={() =>
              router.push(adminRoutes.payment(conversation.paymentId!) as never)
            }
          >
            <Text style={styles.infoLink}>Payment: {conversation.paymentId}</Text>
          </Pressable>
        ) : (
          <Text style={styles.infoLine}>Payment: —</Text>
        )}
        <Text style={styles.infoLine}>
          Created: {formatWhen(conversation?.createdAtMs ?? null)}
        </Text>
      </View>

      {complaintMessage || conversation?.complaintCategory ? (
        <View style={styles.complaintCard}>
          <Text style={styles.infoTitle}>Complaint details</Text>
          <Text style={styles.infoLine}>
            Category: {conversation?.complaintCategory ?? '—'}
          </Text>
          <Text style={styles.infoLine}>
            Status: {statusLabel(conversation?.status ?? 'open')}
          </Text>
          {complaintMessage ? (
            <Text style={styles.complaintBody}>{complaintMessage.body}</Text>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.historyTitle}>Conversation history</Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.sender === 'admin' ? styles.bubbleAdmin : styles.bubbleCustomer,
            ]}
          >
            <Text style={styles.bubbleMeta}>
              {item.sender === 'admin' ? 'Admin' : 'Customer'}
              {item.readByAdmin && item.sender === 'customer' ? ' · Read' : ''}
              {!item.readByCustomer && item.sender === 'admin' ? ' · Unread' : ''}
            </Text>
            <Text style={styles.bubbleText}>{item.body}</Text>
            <Text style={styles.bubbleTime}>{formatWhen(item.createdAtMs)}</Text>
          </View>
        )}
      />

      {conversation?.customerTyping ? (
        <Text style={styles.typingHint}>Customer is typing…</Text>
      ) : null}

      <View style={styles.composer}>
        <AppTextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder="Reply to customer…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          multiline
        />
        <Pressable
          style={[styles.send, sending && { opacity: 0.6 }]}
          onPress={() => void send()}
          disabled={sending}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  actionBar: { maxHeight: 48, paddingHorizontal: 12, marginBottom: 4 },
  actionChip: {
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignSelf: 'center',
  },
  actionChipText: { color: COLORS.text, fontWeight: '700', fontSize: 12 },
  infoCard: { ...adminCardShell, marginHorizontal: 16, marginBottom: 8 },
  complaintCard: {
    ...adminCardShell,
    marginHorizontal: 16,
    marginBottom: 8,
    borderColor: COLORS.primary,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  infoLine: { color: COLORS.textMuted, fontSize: 13, marginBottom: 4, fontWeight: '600' },
  infoLink: { color: COLORS.primary, fontSize: 13, marginBottom: 4, fontWeight: '700' },
  complaintBody: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: '500',
  },
  historyTitle: {
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: { paddingHorizontal: 16, paddingBottom: 12 },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  bubbleCustomer: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleAdmin: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(168,85,247,0.22)',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  bubbleMeta: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  bubbleText: { color: COLORS.text, fontWeight: '600', lineHeight: 20 },
  bubbleTime: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  typingHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  send: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendText: { color: '#fff', fontWeight: '800' },
});
