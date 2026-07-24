import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
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

export default function AdminSupportThreadScreen() {
  const router = useRouter();
  const { threadId: threadParam } = useLocalSearchParams<{ threadId?: string }>();
  const ticketId = typeof threadParam === 'string' ? threadParam : '';
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ticketId) return undefined;
    const unsubMeta = subscribeSupportTicket(ticketId, setTicket);
    const unsubMsg = subscribeSupportTicketMessages(ticketId, setMessages);
    return () => {
      unsubMeta();
      unsubMsg();
    };
  }, [ticketId]);

  const send = async () => {
    if (!ticketId || !draft.trim()) return;
    setSending(true);
    try {
      await sendAdminSupportTicketReply(ticketId, draft);
      setDraft('');
      void setSupportTicketTeamTyping(ticketId, false);
      showSuccess('Reply sent.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not send reply.'));
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (!ticketId) return;
    void setSupportTicketTeamTyping(ticketId, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void setSupportTicketTeamTyping(ticketId, false);
    }, 2000);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title={ticket ? supportTicketTypeLabel(ticket.type) : 'Support ticket'}
        subtitle={supportTicketStatusLabel(ticket?.status ?? 'open')}
        fallbackRoute={adminRoutes.supportInbox}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionBar}>
        <Pressable
          style={styles.actionChip}
          onPress={() =>
            void closeSupportTicket(ticketId)
              .then(() => showSuccess('Ticket closed.'))
              .catch((e) => showError(getReadableErrorMessageOr(e, 'Failed.')))
          }
        >
          <Text style={styles.actionChipText}>Close</Text>
        </Pressable>
        <Pressable
          style={styles.actionChip}
          onPress={() =>
            void reopenSupportTicket(ticketId)
              .then(() => showSuccess('Ticket reopened.'))
              .catch((e) => showError(getReadableErrorMessageOr(e, 'Failed.')))
          }
        >
          <Text style={styles.actionChipText}>Reopen</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Ticket information</Text>
        <Text style={styles.infoLine}>UID: {ticket?.userId ?? '—'}</Text>
        {ticket?.orderId ? (
          <Pressable onPress={() => router.push(adminRoutes.order(ticket.orderId) as never)}>
            <Text style={styles.infoLink}>Order: {ticket.orderId}</Text>
          </Pressable>
        ) : (
          <Text style={styles.infoLine}>Order: —</Text>
        )}
        <Text style={styles.infoLine}>
          Type: {ticket ? supportTicketTypeLabel(ticket.type) : '—'}
        </Text>
        <Text style={styles.infoLine}>
          Created: {formatWhen(ticket?.createdAtMs ?? null)}
        </Text>
      </View>

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
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  infoLine: { color: COLORS.textMuted, fontSize: 13, marginBottom: 4, fontWeight: '600' },
  infoLink: { color: COLORS.primary, fontSize: 13, marginBottom: 4, fontWeight: '700' },
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
