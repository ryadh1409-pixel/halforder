/**
 * Uber Eats-style order Support chat with Emo AI intake, then HalfOrder Team replies.
 * Used only when order room chatType === support.
 */
import AppHeader from '@/components/AppHeader';
import {
  createSupportTicket,
  sendSupportTicketUserMessage,
  subscribeOpenSupportTicketForOrder,
  subscribeSupportTicket,
  subscribeSupportTicketMessages,
  supportMessageDisplayName,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketType,
} from '@/services/supportTickets';
import { useAuth } from '@/services/AuthContext';
import {
  CONTENT_NOT_ALLOWED,
  moderateChatMessage,
} from '@/utils/contentModeration';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError } from '@/utils/toast';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppTextInput } from '@/components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

const EMO_AVATAR = require('../../assets/emo-ai/tab-avatar.png');
const CHAT_MAX = 2000;

const EMO_GREETING =
  "Hi! I'm Emo, HalfOrder's support assistant.\nWhat type of issue are you experiencing?";
const EMO_ASK_DETAILS =
  "Please describe your issue and we'll make sure the right team looks into it.";
const EMO_THANKS =
  'Thank you for reaching out. The HalfOrder support team has been notified and will contact you as soon as possible. We appreciate your patience. 🤍';

type LocalSender = 'user' | 'emo' | 'halforder_team';

type LocalMessage = {
  id: string;
  text: string;
  sender: LocalSender;
  createdAtMs: number;
};

type FlowStep = 'pick_type' | 'describe' | 'submitted';

function formatMessageTime(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '';
  try {
    return new Date(ms).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function typeLabel(type: SupportTicketType): string {
  return type === 'food_complaint' ? 'Food complaint' : 'Delivery complaint';
}

function ticketMessageToLocal(m: SupportTicketMessage): LocalMessage {
  const display = supportMessageDisplayName(m);
  let sender: LocalSender = 'user';
  if (m.sender === 'halforder_team') {
    sender = display === 'Emo' ? 'emo' : 'halforder_team';
  }
  return {
    id: m.id,
    text: m.text,
    sender,
    createdAtMs: m.createdAtMs ?? 0,
  };
}

type Props = {
  orderId: string;
};

export function OrderSupportChat({ orderId }: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [remoteMessages, setRemoteMessages] = useState<SupportTicketMessage[]>(
    [],
  );
  const [loadingTicket, setLoadingTicket] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>('pick_type');
  const [complaintType, setComplaintType] = useState<SupportTicketType | null>(
    null,
  );
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>(() => [
    {
      id: 'emo-greeting',
      text: EMO_GREETING,
      sender: 'emo',
      createdAtMs: Date.now(),
    },
  ]);
  const [emoTyping, setEmoTyping] = useState(false);

  const listRef = useRef<FlatList<LocalMessage> | null>(null);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!orderId.trim() || !uid) {
      setLoadingTicket(false);
      setTicket(null);
      return undefined;
    }
    setLoadingTicket(true);
    return subscribeOpenSupportTicketForOrder(orderId, uid, (row) => {
      setTicket(row);
      setLoadingTicket(false);
      if (row) {
        setFlowStep('submitted');
        setComplaintType(row.type);
        setLocalMessages([]);
      }
    });
  }, [orderId, uid]);

  useEffect(() => {
    if (!ticket?.id) {
      setRemoteMessages([]);
      return undefined;
    }
    const unsubMsgs = subscribeSupportTicketMessages(ticket.id, setRemoteMessages);
    const unsubMeta = subscribeSupportTicket(ticket.id, (row) => {
      if (row) setTicket(row);
    });
    return () => {
      unsubMsgs();
      unsubMeta();
    };
  }, [ticket?.id]);

  useEffect(() => {
    if (!ticket || remoteMessages.length === 0) return;
    if (bootstrappedRef.current && flowStep === 'submitted') {
      setLocalMessages(remoteMessages.map(ticketMessageToLocal));
      return;
    }
    bootstrappedRef.current = true;
    setLocalMessages(remoteMessages.map(ticketMessageToLocal));
    setFlowStep('submitted');
  }, [ticket, remoteMessages, flowStep]);

  const messages = useMemo(() => localMessages, [localMessages]);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, emoTyping, ticket?.teamTyping]);

  const showQuickReplies = flowStep === 'pick_type' && !ticket;
  const canCompose = flowStep === 'describe' || flowStep === 'submitted';
  const teamTyping = ticket?.teamTyping === true;
  const showTyping = emoTyping || teamTyping;
  const typingLabel = teamTyping
    ? 'HalfOrder Team is typing...'
    : 'Emo is typing...';

  const appendLocal = (rows: Omit<LocalMessage, 'id' | 'createdAtMs'>[]) => {
    const now = Date.now();
    setLocalMessages((prev) => [
      ...prev,
      ...rows.map((r, i) => ({
        ...r,
        id: `local-${now}-${i}`,
        createdAtMs: now + i,
      })),
    ]);
  };

  const onPickType = (type: SupportTicketType) => {
    if (flowStep !== 'pick_type' || sending) return;
    setComplaintType(type);
    appendLocal([{ sender: 'user', text: typeLabel(type) }]);
    setFlowStep('describe');
    setEmoTyping(true);
    setTimeout(() => {
      setEmoTyping(false);
      appendLocal([{ sender: 'emo', text: EMO_ASK_DETAILS }]);
    }, 650);
  };

  const onSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !uid || sending || !canCompose) return;

    const mod = moderateChatMessage(trimmed, { maxLength: CHAT_MAX });
    if (!mod.ok) {
      showError(
        mod.reason === CONTENT_NOT_ALLOWED ? CONTENT_NOT_ALLOWED : mod.reason,
      );
      return;
    }

    setSending(true);
    try {
      if (flowStep === 'describe' && complaintType && !ticket) {
        appendLocal([{ sender: 'user', text: mod.text }]);
        setInput('');
        setEmoTyping(true);

        const transcript = [
          { sender: 'halforder_team' as const, text: EMO_GREETING, persona: 'emo' as const },
          {
            sender: 'user' as const,
            text: typeLabel(complaintType),
          },
          {
            sender: 'halforder_team' as const,
            text: EMO_ASK_DETAILS,
            persona: 'emo' as const,
          },
          { sender: 'user' as const, text: mod.text },
          {
            sender: 'halforder_team' as const,
            text: EMO_THANKS,
            persona: 'emo' as const,
          },
        ];

        const ticketId = await createSupportTicket({
          orderId,
          type: complaintType,
          message: mod.text,
          transcript,
        });

        setEmoTyping(false);
        appendLocal([{ sender: 'emo', text: EMO_THANKS }]);
        setFlowStep('submitted');
        // Snapshot listener will attach ticket + remote messages.
        setTicket({
          id: ticketId,
          orderId,
          userId: uid,
          type: complaintType,
          message: mod.text,
          status: 'open',
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          teamTyping: false,
        });
        bootstrappedRef.current = true;
      } else if (ticket?.id) {
        await sendSupportTicketUserMessage({
          ticketId: ticket.id,
          text: mod.text,
        });
        setInput('');
      }
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not send message'));
    } finally {
      setSending(false);
      setEmoTyping(false);
    }
  };

  const canSend =
    !!uid &&
    input.trim().length > 0 &&
    !sending &&
    canCompose &&
    (flowStep === 'describe' || !!ticket?.id);

  const renderMessage = ({ item }: { item: LocalMessage }) => {
    const mine = item.sender === 'user';
    const name =
      item.sender === 'emo'
        ? 'Emo'
        : item.sender === 'halforder_team'
          ? 'HalfOrder Team'
          : null;
    return (
      <View style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
        {!mine ? (
          item.sender === 'emo' ? (
            <Image
              source={EMO_AVATAR}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.teamAvatar}>
              <Text style={styles.teamAvatarText}>H</Text>
            </View>
          )
        ) : (
          <View style={styles.avatarSpacer} />
        )}
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
          ]}
        >
          {name ? <Text style={styles.senderName}>{name}</Text> : null}
          <Text style={[styles.text, mine ? styles.textMine : styles.textTheirs]}>
            {item.text}
          </Text>
          <View
            style={[
              styles.metaRow,
              mine ? styles.metaRowMine : styles.metaRowTheirs,
            ]}
          >
            {formatMessageTime(item.createdAtMs) ? (
              <Text style={styles.metaText}>
                {formatMessageTime(item.createdAtMs)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  if (!uid) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <AppHeader title="Support" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Sign in to contact support.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader title="Support" />

      <View style={styles.headerCard}>
        <Image source={EMO_AVATAR} style={styles.headerAvatar} contentFit="cover" />
        <View style={styles.headerMeta}>
          <Text style={styles.headerTitle}>Emo · HalfOrder Support</Text>
          <Text style={styles.headerSub}>
            {teamTyping ? 'HalfOrder Team is typing...' : 'Usually replies soon'}
          </Text>
        </View>
      </View>

      <View style={styles.chatBody}>
        {loadingTicket || (ticket && messages.length === 0 && !emoTyping) ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#A855F7" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
            ListFooterComponent={
              showTyping ? (
                <View style={styles.typingRow}>
                  <ActivityIndicator size="small" color="#A855F7" />
                  <Text style={styles.typingText}>{typingLabel}</Text>
                </View>
              ) : null
            }
          />
        )}
      </View>

      {showQuickReplies ? (
        <View style={styles.quickRow}>
          <Pressable
            style={styles.quickBtn}
            onPress={() => onPickType('food_complaint')}
          >
            <Text style={styles.quickBtnText}>Food complaint</Text>
          </Pressable>
          <Pressable
            style={styles.quickBtn}
            onPress={() => onPickType('delivery_complaint')}
          >
            <Text style={styles.quickBtnText}>Delivery complaint</Text>
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inputRow}>
          <AppTextInput
            value={input}
            onChangeText={setInput}
            placeholder={
              !canCompose
                ? 'Choose an issue type above…'
                : flowStep === 'describe'
                  ? 'Describe your issue…'
                  : 'Write a message...'
            }
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            editable={!sending && canCompose}
            onSubmitEditing={() => void onSend()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={() => void onSend()}
          >
            <Text style={styles.sendBtnText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 14,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  headerMeta: { flex: 1, minWidth: 0 },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  headerSub: {
    color: 'rgba(248,250,252,0.55)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  chatBody: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: { color: '#EF4444', fontSize: 14 },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 16,
  },
  row: {
    width: '100%',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: 2,
  },
  teamAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: 2,
    backgroundColor: 'rgba(168, 85, 247, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamAvatarText: {
    color: '#E9D5FF',
    fontWeight: '900',
    fontSize: 12,
  },
  avatarSpacer: { width: 28 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(23,25,35,0.92)',
  },
  bubbleMine: {
    backgroundColor: 'rgba(16, 36, 29, 0.95)',
    borderColor: 'rgba(168, 85, 247, 0.25)',
  },
  bubbleTheirs: {
    backgroundColor: 'rgba(20, 25, 34, 0.95)',
    borderColor: 'rgba(125, 211, 252, 0.18)',
  },
  senderName: {
    marginBottom: 6,
    color: 'rgba(248,250,252,0.62)',
    fontSize: 12,
    fontWeight: '700',
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  textMine: { color: '#E9FFF6' },
  textTheirs: { color: '#FFFFFF' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  metaRowMine: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  metaRowTheirs: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  metaText: {
    color: 'rgba(248,250,252,0.45)',
    fontSize: 11,
    fontWeight: '700',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  typingText: {
    color: 'rgba(248,250,252,0.62)',
    fontSize: 13,
    fontWeight: '600',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  quickBtn: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  quickBtnText: {
    color: '#C084FC',
    fontWeight: '800',
    fontSize: 13,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(17, 22, 31, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  sendBtn: {
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: {
    color: '#C084FC',
    fontWeight: '800',
    fontSize: 14,
  },
});
