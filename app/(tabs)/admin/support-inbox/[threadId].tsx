import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { SupportImageGallery } from '@/components/support/SupportImageGallery';
import { SupportStatusChip } from '@/components/support/SupportStatusChip';
import {
  formatSupportCategory,
  formatTicketNumber,
  priorityLabel,
} from '@/components/support/supportDisplay';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  assignSupportConversationAgent,
  closeSupportConversation,
  markSupportReadByAdmin,
  reopenSupportConversation,
  resolveSupportConversation,
  sendAdminSupportReply,
  setSupportConversationPriority,
  setSupportConversationStatus,
  setSupportTyping,
  statusLabel,
  subscribeSupportConversation,
  subscribeSupportConversationMessages,
  type SupportConversation,
  type SupportConversationMessage,
  type SupportConversationPriority,
  type SupportConversationStatus,
} from '@/services/supportConversations';
import { refreshAppBadgeNow } from '@/services/appBadgeManager';
import {
  closeSupportTicket,
  reopenSupportTicket,
  sendAdminSupportTicketReply,
  setSupportTicketTeamTyping,
  subscribeSupportTicket,
  subscribeSupportTicketMessages,
  supportTicketStatusLabel,
  supportTicketTypeLabel,
  type SupportTicket,
  type SupportTicketMessage,
} from '@/services/supportTickets';
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

const PRIORITIES: SupportConversationPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
];

const STATUSES: SupportConversationStatus[] = [
  'open',
  'reviewing',
  'waiting',
  'resolved',
  'closed',
];

export default function AdminSupportThreadScreen() {
  const router = useRouter();
  const { threadId: threadParam } = useLocalSearchParams<{ threadId?: string }>();
  const threadId = typeof threadParam === 'string' ? threadParam : '';

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportTicketMessage[]>([]);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [convMessages, setConvMessages] = useState<SupportConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!threadId) return undefined;
    const unsubTicket = subscribeSupportTicket(threadId, setTicket);
    const unsubTicketMsg = subscribeSupportTicketMessages(threadId, setTicketMessages);
    const unsubConv = subscribeSupportConversation(threadId, (row) => {
      setConversation(row);
      if (row && row.unreadAdmin > 0) {
        void markSupportReadByAdmin(threadId)
          .then(() => refreshAppBadgeNow())
          .catch(() => undefined);
      }
    });
    const unsubConvMsg = subscribeSupportConversationMessages(threadId, setConvMessages);
    return () => {
      unsubTicket();
      unsubTicketMsg();
      unsubConv();
      unsubConvMsg();
    };
  }, [threadId]);

  const isConversation = !!conversation;
  const mode: 'conversation' | 'ticket' | 'loading' = conversation
    ? 'conversation'
    : ticket
      ? 'ticket'
      : 'loading';

  const send = async () => {
    if (!threadId || !draft.trim()) return;
    setSending(true);
    try {
      if (isConversation) {
        await sendAdminSupportReply(threadId, draft);
        void setSupportTyping(threadId, 'admin', false);
      } else {
        await sendAdminSupportTicketReply(threadId, draft);
        void setSupportTicketTeamTyping(threadId, false);
      }
      setDraft('');
      showSuccess('Reply sent.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not send reply.'));
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (!threadId) return;
    if (isConversation) {
      void setSupportTyping(threadId, 'admin', true);
    } else {
      void setSupportTicketTeamTyping(threadId, true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      if (isConversation) void setSupportTyping(threadId, 'admin', false);
      else void setSupportTicketTeamTyping(threadId, false);
    }, 2000);
  };

  const title = isConversation
    ? conversation.userName || 'Customer support'
    : ticket
      ? supportTicketTypeLabel(ticket.type)
      : 'Support thread';

  const subtitle = isConversation
    ? statusLabel(conversation.status)
    : supportTicketStatusLabel(ticket?.status ?? 'open');

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title={title}
        subtitle={subtitle}
        fallbackRoute={adminRoutes.supportInbox}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionBar}>
        {isConversation ? (
          <>
            {STATUSES.map((s) => (
              <Pressable
                key={s}
                style={styles.actionChip}
                onPress={() =>
                  void setSupportConversationStatus(threadId, s)
                    .then(() => showSuccess(`Status → ${statusLabel(s)}`))
                    .catch((e) =>
                      showError(getReadableErrorMessageOr(e, 'Failed.')),
                    )
                }
              >
                <Text style={styles.actionChipText}>{statusLabel(s)}</Text>
              </Pressable>
            ))}
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                style={styles.actionChip}
                onPress={() =>
                  void setSupportConversationPriority(threadId, p)
                    .then(() => showSuccess(`Priority → ${p}`))
                    .catch((e) =>
                      showError(getReadableErrorMessageOr(e, 'Failed.')),
                    )
                }
              >
                <Text style={styles.actionChipText}>P: {p}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.actionChip}
              onPress={() =>
                void assignSupportConversationAgent(threadId, 'HalfOrder Support')
                  .then(() => showSuccess('Assigned to HalfOrder Support'))
                  .catch((e) =>
                    showError(getReadableErrorMessageOr(e, 'Failed.')),
                  )
              }
            >
              <Text style={styles.actionChipText}>Assign me</Text>
            </Pressable>
            <Pressable
              style={styles.actionChip}
              onPress={() =>
                void resolveSupportConversation(threadId)
                  .then(() => showSuccess('Resolved.'))
                  .catch((e) =>
                    showError(getReadableErrorMessageOr(e, 'Failed.')),
                  )
              }
            >
              <Text style={styles.actionChipText}>Resolve</Text>
            </Pressable>
            <Pressable
              style={styles.actionChip}
              onPress={() =>
                void closeSupportConversation(threadId)
                  .then(() => showSuccess('Closed.'))
                  .catch((e) =>
                    showError(getReadableErrorMessageOr(e, 'Failed.')),
                  )
              }
            >
              <Text style={styles.actionChipText}>Close</Text>
            </Pressable>
            <Pressable
              style={styles.actionChip}
              onPress={() =>
                void reopenSupportConversation(threadId)
                  .then(() => showSuccess('Reopened.'))
                  .catch((e) =>
                    showError(getReadableErrorMessageOr(e, 'Failed.')),
                  )
              }
            >
              <Text style={styles.actionChipText}>Reopen</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={styles.actionChip}
              onPress={() =>
                void closeSupportTicket(threadId)
                  .then(() => showSuccess('Ticket closed.'))
                  .catch((e) =>
                    showError(getReadableErrorMessageOr(e, 'Failed.')),
                  )
              }
            >
              <Text style={styles.actionChipText}>Close</Text>
            </Pressable>
            <Pressable
              style={styles.actionChip}
              onPress={() =>
                void reopenSupportTicket(threadId)
                  .then(() => showSuccess('Ticket reopened.'))
                  .catch((e) =>
                    showError(getReadableErrorMessageOr(e, 'Failed.')),
                  )
              }
            >
              <Text style={styles.actionChipText}>Reopen</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <View style={styles.infoCard}>
        <Text style={styles.infoKicker}>Ticket details</Text>
        {isConversation ? (
          <>
            <View style={styles.infoHeaderRow}>
              <Text style={styles.infoTitle}>
                {formatTicketNumber(conversation.referenceNumber, conversation.id)}
              </Text>
              <SupportStatusChip status={conversation.status} />
            </View>
            <View style={styles.infoGrid}>
              <Text style={styles.infoLine}>
                Customer: {conversation.userName || '—'}
              </Text>
              <Text style={styles.infoLine}>
                Email: {conversation.userEmail || '—'}
              </Text>
              <Text style={styles.infoLine}>
                Customer ID: {conversation.userId}
              </Text>
              <Text style={styles.infoLine}>
                Category: {formatSupportCategory(conversation.complaintCategory)}
              </Text>
              <Text style={styles.infoLine}>
                Priority: {priorityLabel(conversation.priority)}
              </Text>
              <Text style={styles.infoLine}>
                Agent: {conversation.assignedAgent ?? 'Unassigned'}
              </Text>
              <Text style={styles.infoLine}>
                Platform: {conversation.platform ?? '—'}
              </Text>
              <Text style={styles.infoLine}>
                Payment: {conversation.paymentId ?? '—'}
              </Text>
              <Text style={styles.infoLine}>Restaurant: —</Text>
              <Text style={styles.infoLine}>Driver: —</Text>
              {conversation.orderId ? (
                <Pressable
                  onPress={() =>
                    router.push(adminRoutes.order(conversation.orderId!) as never)
                  }
                >
                  <Text style={styles.infoLink}>
                    Order: {conversation.orderId}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.infoLine}>Order: —</Text>
              )}
              <Text style={styles.infoLine}>
                Created: {formatWhen(conversation.createdAtMs)}
              </Text>
              <Text style={styles.infoLine}>
                Attachments: {conversation.attachmentUrls.length}
              </Text>
            </View>
            {conversation.attachmentUrls.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <SupportImageGallery
                  urls={conversation.attachmentUrls}
                  allowDownload
                  compact
                />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.infoTitle}>
              {formatTicketNumber(null, ticket?.id ?? threadId)}
            </Text>
            <View style={styles.infoGrid}>
              <Text style={styles.infoLine}>
                Customer ID: {ticket?.userId ?? '—'}
              </Text>
              {ticket?.orderId ? (
                <Pressable
                  onPress={() => router.push(adminRoutes.order(ticket.orderId) as never)}
                >
                  <Text style={styles.infoLink}>Order: {ticket.orderId}</Text>
                </Pressable>
              ) : (
                <Text style={styles.infoLine}>Order: —</Text>
              )}
              <Text style={styles.infoLine}>
                Category:{' '}
                {ticket ? supportTicketTypeLabel(ticket.type) : '—'}
              </Text>
              <Text style={styles.infoLine}>Restaurant: —</Text>
              <Text style={styles.infoLine}>Driver: —</Text>
              <Text style={styles.infoLine}>
                Created: {formatWhen(ticket?.createdAtMs ?? null)}
              </Text>
            </View>
          </>
        )}
      </View>

      {mode === 'conversation' ? (
        <FlatList
          data={convMessages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.historyTitle}>Conversation history</Text>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.sender === 'admin'
                  ? styles.bubbleAdmin
                  : item.sender === 'system'
                    ? styles.bubbleSystem
                    : styles.bubbleCustomer,
              ]}
            >
              <Text style={styles.bubbleMeta}>
                {item.sender === 'admin'
                  ? 'HalfOrder Team'
                  : item.sender === 'system'
                    ? 'Emo AI'
                    : item.kind === 'complaint'
                      ? 'Customer · Request'
                      : 'Customer'}
              </Text>
              <Text style={styles.bubbleText}>{item.body}</Text>
              {item.attachments.length > 0 ? (
                <SupportImageGallery
                  urls={item.attachments.map((a) => a.url)}
                  allowDownload
                  compact
                />
              ) : null}
              <Text style={styles.bubbleTime}>{formatWhen(item.createdAtMs)}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={ticketMessages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.historyTitle}>Conversation history</Text>
          }
          ListEmptyComponent={
            mode === 'loading' ? (
              <Text style={styles.bubbleText}>Loading thread…</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.sender === 'halforder_team'
                  ? styles.bubbleAdmin
                  : styles.bubbleCustomer,
              ]}
            >
              <Text style={styles.bubbleMeta}>
                {item.sender === 'halforder_team'
                  ? item.persona === 'emo'
                    ? 'Emo'
                    : 'HalfOrder Team'
                  : 'Customer'}
              </Text>
              <Text style={styles.bubbleText}>{item.text}</Text>
              <Text style={styles.bubbleTime}>{formatWhen(item.createdAtMs)}</Text>
            </View>
          )}
        />
      )}

      <View style={styles.composer}>
        <AppTextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder="Reply as HalfOrder Team…"
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
  infoKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  infoGrid: { gap: 4 },
  infoLine: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  infoLink: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
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
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  bubbleCustomer: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 6,
  },
  bubbleAdmin: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(168,85,247,0.22)',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderBottomRightRadius: 6,
  },
  bubbleSystem: {
    alignSelf: 'center',
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
  },
  bubbleMeta: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  bubbleText: { color: COLORS.text, fontWeight: '600', lineHeight: 20 },
  bubbleTime: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
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
    borderRadius: 16,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  send: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendText: { color: '#fff', fontWeight: '800' },
});
