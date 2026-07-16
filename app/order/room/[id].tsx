/**
 * Legacy thread: messages under `orders/{orderId}/messages`.
 * Primary order UI + HalfOrder flow: `/order/[id]` (sibling route).
 */
import AppHeader from '../../../components/AppHeader';
import ReportUserModal from '../../../components/ReportUserModal';
import type { OrderChatType } from '@/constants/orderChat';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { theme } from '../../../constants/theme';
import { useAuth } from '@/services/AuthContext';
import { auth, db } from '../../../services/firebase';
import type { UserRole } from '@/services/userService';
import { CONTENT_NOT_ALLOWED, moderateChatMessage } from '../../../utils/contentModeration';
import { getReadableErrorMessageOr } from '../../../utils/errorMessages';
import { showError, showSuccess } from '../../../utils/toast';
import { reportContentIdChatMessage } from '../../../services/reports';
import { safeToMillis } from '../../../utils/safeToMillis';
import { useLocalSearchParams } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTextInput } from '../../../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Align with `OrderRoomScreen` / `chatSecurity` order chat limits. */
const ORDER_ROOM_CHAT_MAX = 200;
const CHAT_READ_ONLY_AFTER_MS = 24 * 60 * 60 * 1000;

type OrderMessage = {
  id: string;
  text?: string;
  chatType?: string;
  senderId?: string;
  senderUid?: string;
  senderName?: string;
  senderRole?: string;
  createdAt?: unknown;
  sentAt?: unknown;
  deliveredAt?: unknown;
  readAt?: unknown;
  system?: boolean;
};

type MessageStatus = 'sent' | 'delivered' | 'read';

function formatMessageTime(value: unknown): string {
  const ms = safeToMillis(value);
  if (ms == null) return '';
  try {
    return new Date(ms).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function messageStatus(item: OrderMessage): MessageStatus {
  if (safeToMillis(item.readAt) != null) return 'read';
  if (safeToMillis(item.deliveredAt) != null) return 'delivered';
  return 'sent';
}

function statusGlyph(status: MessageStatus): string {
  return status === 'sent' ? '✓' : '✓✓';
}

function isTerminalOrder(data: Record<string, unknown>): boolean {
  const status = String(data.status ?? '').toLowerCase();
  const deliveryStatus = String(data.deliveryStatus ?? '').toLowerCase();
  return (
    status === 'completed' ||
    status === 'delivered' ||
    deliveryStatus === 'delivered' ||
    deliveryStatus === 'completed'
  );
}

function terminalAtMs(data: Record<string, unknown>): number | null {
  return (
    safeToMillis(data.completedAt) ??
    safeToMillis(data.deliveredAt) ??
    safeToMillis(data.updatedAt)
  );
}

function mapParticipantSenderRole(role: UserRole | null): string {
  if (role === 'driver') return 'driver';
  if (role === 'restaurant' || role === 'host') return 'restaurant';
  if (role === 'admin') return 'admin';
  return 'customer';
}

export default function OrderChatScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    chatType?: string | string[];
  }>();
  const orderId = useMemo(() => {
    const raw = params.id;
    const str = Array.isArray(raw) ? raw[0] : raw;
    return typeof str === 'string' ? str : '';
  }, [params.id]);

  const chatType: OrderChatType = useMemo(() => {
    const raw = params.chatType;
    const str = (Array.isArray(raw) ? raw[0] : raw)?.trim?.() ?? '';
    if (str === ORDER_CHAT_TYPE.RESTAURANT_DRIVER) return ORDER_CHAT_TYPE.RESTAURANT_DRIVER;
    if (str === ORDER_CHAT_TYPE.SUPPORT) return ORDER_CHAT_TYPE.SUPPORT;
    return ORDER_CHAT_TYPE.CUSTOMER_DRIVER;
  }, [params.chatType]);

  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [reportMessage, setReportMessage] = useState<OrderMessage | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const listRef = useRef<FlatList<OrderMessage> | null>(null);

  const { firestoreUserRole } = useAuth();
  const currentUser = auth.currentUser;
  const uid = currentUser?.uid ?? '';

  const messagesRef = useMemo(() => {
    if (!orderId.trim()) return null;
    return collection(db, 'orders', orderId, 'messages');
  }, [orderId]);

  const q = useMemo(() => {
    if (!messagesRef) return null;
    return query(messagesRef, orderBy('createdAt', 'asc'));
  }, [messagesRef]);

  useEffect(() => {
    if (!orderId.trim()) {
      setReadOnly(false);
      return undefined;
    }
    return onSnapshot(doc(db, 'orders', orderId), (snap) => {
      const data = snap.data() as Record<string, unknown> | undefined;
      if (!data || !isTerminalOrder(data)) {
        setReadOnly(false);
        return;
      }
      const terminalMs = terminalAtMs(data);
      setReadOnly(
        terminalMs != null && Date.now() - terminalMs >= CHAT_READ_ONLY_AFTER_MS,
      );
    });
  }, [orderId]);

  useEffect(() => {
    if (!q) {
      setMessages([]);
      setLoading(false);
      setError(orderId.trim() ? null : 'Missing order id.');
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const next: OrderMessage[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<OrderMessage, 'id'>),
        }));
        const filtered = next.filter((m) => {
          const t = m.chatType;
          if (!t) return chatType === ORDER_CHAT_TYPE.CUSTOMER_DRIVER;
          return t === chatType;
        });
        setMessages(filtered);
        setLoading(false);
      },
      (e) => {
        setError(getReadableErrorMessageOr(e, 'Failed to load messages'));
        setLoading(false);
      },
    );

    return () => unsub();
  }, [q, orderId, chatType]);

  useEffect(() => {
    if (!listRef.current) return;
    // Fire-and-forget scroll on every message update.
    // The list updates are driven by Firestore snapshots.
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length]);

  useEffect(() => {
    if (!orderId || !uid || messages.length === 0) return;
    const incoming = messages.filter(
      (message) =>
        (message.senderUid || message.senderId) &&
        (message.senderUid || message.senderId) !== uid &&
        (message.senderUid || message.senderId) !== 'system' &&
        !message.system &&
        safeToMillis(message.readAt) == null,
    );
    if (incoming.length === 0) return;

    const batch = writeBatch(db);
    incoming.forEach((message) => {
      const patch =
        safeToMillis(message.deliveredAt) == null
          ? { deliveredAt: serverTimestamp(), readAt: serverTimestamp() }
          : { readAt: serverTimestamp() };
      batch.update(doc(db, 'orders', orderId, 'messages', message.id), {
        ...patch,
      });
    });
    batch.commit().catch(() => {
      /* offline / rules */
    });
  }, [messages, orderId, uid]);

  const canSend = !!uid && input.trim().length > 0 && !sending && !readOnly;

  const onSend = async () => {
    if (!messagesRef) return;
    if (!uid) return;
    if (!canSend) return;

    const text = input.trim();
    const mod = moderateChatMessage(text, { maxLength: ORDER_ROOM_CHAT_MAX });
    if (!mod.ok) {
      showError(
        mod.reason === CONTENT_NOT_ALLOWED ? CONTENT_NOT_ALLOWED : mod.reason,
      );
      return;
    }
    setSending(true);
    try {
      await addDoc(messagesRef, {
        text: mod.text,
        chatType,
        senderId: uid,
        senderUid: uid,
        senderRole: mapParticipantSenderRole(firestoreUserRole ?? null),
        senderName:
          typeof currentUser?.displayName === 'string' && currentUser.displayName.trim()
            ? currentUser.displayName
            : currentUser?.email?.split('@')[0] ?? 'User',
        createdAt: serverTimestamp(),
        sentAt: serverTimestamp(),
        deliveredAt: null,
        readAt: null,
      });
      await updateDoc(doc(db, 'orders', orderId), {
        lastChatMessage: mod.text,
        lastChatMessageAt: serverTimestamp(),
      }).catch(() => undefined);
      setInput('');
    } catch (e) {
      setError(getReadableErrorMessageOr(e, 'Failed to send message'));
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: OrderMessage }) => {
    const senderUid = item.senderUid || item.senderId;
    const mine = senderUid === uid;
    const system = item.senderId === 'system' || item.system === true;
    const bubbleStyle = mine ? styles.bubbleMine : styles.bubbleTheirs;
    const textStyle = mine ? styles.textMine : styles.textTheirs;
    const timeLabel = formatMessageTime(item.createdAt);
    const status = mine && !system ? messageStatus(item) : null;
    return (
      <Pressable
        style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}
        onLongPress={() => {
          if (!mine && !system && senderUid) setReportMessage(item);
        }}
      >
        <View style={[styles.bubble, bubbleStyle]}>
          {!mine && (item.senderName || item.senderRole) ? (
            <Text style={[styles.senderName, styles.textMuted]}>
              {item.senderName ?? 'User'}
              {item.senderRole ? ` · ${item.senderRole}` : ''}
            </Text>
          ) : null}
          <Text style={[styles.text, textStyle]}>{item.text ?? ''}</Text>
          <View style={[styles.metaRow, mine ? styles.metaRowMine : styles.metaRowTheirs]}>
            {timeLabel ? <Text style={styles.metaText}>{timeLabel}</Text> : null}
            {status ? (
              <Text
                style={[styles.statusText, status === 'read' && styles.statusRead]}
                accessibilityLabel={`Message ${status}`}
              >
                {statusGlyph(status)}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader
        title={
          chatType === ORDER_CHAT_TYPE.RESTAURANT_DRIVER
            ? 'Restaurant ↔ Driver'
            : chatType === ORDER_CHAT_TYPE.SUPPORT
              ? 'Support'
              : 'Driver chat'
        }
      />

      <View style={styles.chatBody}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
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
          />
        )}
        {readOnly ? (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyTitle}>Chat is read-only</Text>
            <Text style={styles.readOnlyBody}>Chats close 24 hours after order completion.</Text>
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inputRow}>
          <AppTextInput
            value={input}
            onChangeText={setInput}
            placeholder={readOnly ? 'Chat is read-only' : 'Write a message...'}
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            editable={!sending && !!uid && !readOnly}
            onSubmitEditing={onSend}
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
      <ReportUserModal
        visible={!!reportMessage && !!uid}
        onClose={() => setReportMessage(null)}
        reporterId={uid}
        reportedUserId={reportMessage?.senderUid ?? reportMessage?.senderId ?? ''}
        contentId={
          reportMessage
            ? reportContentIdChatMessage(`${orderId}_${chatType}`, reportMessage.id)
            : ''
        }
        onSubmitted={() => showSuccess('We received your report.')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#09090B',
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  headerSpacer: {
    width: 38,
  },
  chatBody: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
  },
  readOnlyBanner: {
    marginVertical: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.24)',
  },
  readOnlyTitle: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '900',
  },
  readOnlyBody: {
    color: 'rgba(248,250,252,0.68)',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 16,
  },
  row: {
    width: '100%',
    marginBottom: 10,
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
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
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  bubbleTheirs: {
    backgroundColor: 'rgba(20, 25, 34, 0.95)',
    borderColor: 'rgba(125, 211, 252, 0.18)',
  },
  senderName: {
    marginBottom: 6,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  textMine: {
    color: '#E9FFF6',
  },
  textTheirs: {
    color: '#FFFFFF',
  },
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
  statusText: {
    color: '#7D8493',
    fontSize: 11,
    fontWeight: '900',
  },
  statusRead: {
    color: '#38BDF8',
  },
  textMuted: {
    color: 'rgba(248,250,252,0.62)',
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: '#A7F3D0',
    fontWeight: '800',
    fontSize: 14,
  },
});

