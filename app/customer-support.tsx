import {
  formatCreatedShort,
  formatDaySeparator,
  formatMessageClock,
  formatSupportCategory,
  formatTicketNumber,
} from '@/components/support/supportDisplay';
import { SupportAttachmentSheet } from '@/components/support/SupportAttachmentSheet';
import { SupportImageGallery } from '@/components/support/SupportImageGallery';
import { SupportStatusChip } from '@/components/support/SupportStatusChip';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import {
  markSupportReadByCustomer,
  sendCustomerSupportMessage,
  setSupportTyping,
  subscribeCustomerSupportConversation,
  subscribeSupportConversationMessages,
  type SupportConversation,
  type SupportConversationMessage,
  type SupportMessageAttachment,
} from '@/services/supportConversations';
import { refreshAppBadgeNow } from '@/services/appBadgeManager';
import {
  pickSupportImagesFromLibrary,
  takeSupportPhoto,
  uploadSupportAttachments,
} from '@/services/supportAttachments';
import {
  buildEmoSupportGreeting,
  firstNameFromDisplayName,
} from '@/services/supportIntake';
import { ImagePickerPermissionError } from '@/services/imagePicker';
import { useAuth } from '@/services/AuthContext';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'support@halforder.app';
const HALFORDER_AVATAR =
  'https://ui-avatars.com/api/?name=HalfOrder&background=A855F7&color=fff&size=128';

function sameDay(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function MessageBubble({
  item,
  prev,
  onRetry,
}: {
  item: SupportConversationMessage;
  prev: SupportConversationMessage | null;
  onRetry?: () => void;
}) {
  const isCustomer = item.sender === 'customer';
  const isSystem = item.sender === 'system' || item.kind === 'system';
  const isComplaint = item.kind === 'complaint';
  const urls = item.attachments.map((a) => a.url);
  const showDay = !prev || !sameDay(prev.createdAtMs, item.createdAtMs);

  const bubble = (() => {
    if (isComplaint) {
      return (
        <View style={styles.complaintBubble}>
          <Text style={styles.complaintLabel}>Your request</Text>
          <Text style={styles.bubbleBody}>{item.body}</Text>
          {urls.length > 0 ? <SupportImageGallery urls={urls} /> : null}
          <Text style={styles.bubbleTime}>{formatMessageClock(item.createdAtMs)}</Text>
        </View>
      );
    }
    if (isSystem) {
      return (
        <View style={styles.systemBubble}>
          <Text style={styles.emoLabel}>Emo</Text>
          <Text style={styles.bubbleBody}>{item.body}</Text>
          <Text style={styles.bubbleTime}>{formatMessageClock(item.createdAtMs)}</Text>
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
        {!isCustomer ? (
          <Text style={styles.supportLabel}>HalfOrder Support</Text>
        ) : null}
        {item.body ? <Text style={styles.bubbleBody}>{item.body}</Text> : null}
        {urls.length > 0 ? (
          <View style={styles.attachBlock}>
            <SupportImageGallery urls={urls} />
          </View>
        ) : null}
        {item.uploadFailed ? (
          <Pressable onPress={onRetry} style={styles.retryRow}>
            <Ionicons name="refresh" size={14} color="#FBBF24" />
            <Text style={styles.retryText}>Couldn’t upload · Tap to retry</Text>
          </Pressable>
        ) : null}
        <View style={styles.metaRow}>
          <Text
            style={[
              styles.bubbleTime,
              isCustomer && styles.bubbleTimeOnPrimary,
            ]}
          >
            {formatMessageClock(item.createdAtMs)}
          </Text>
          {isCustomer ? (
            <Text style={styles.readStatus}>
              {item.readByAdmin ? 'Read' : 'Sent'}
            </Text>
          ) : null}
        </View>
      </View>
    );
  })();

  return (
    <View>
      {showDay ? (
        <View style={styles.daySep}>
          <Text style={styles.daySepText}>{formatDaySeparator(item.createdAtMs)}</Text>
        </View>
      ) : null}
      {bubble}
    </View>
  );
}

export default function CustomerSupportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = user?.uid ?? '';
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingUris, setPendingUris] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [failedIndexes, setFailedIndexes] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const listRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingLock = useRef(false);

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
    void refreshAppBadgeNow();
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
  }, [messages.length, pendingUris.length]);

  useEffect(() => {
    if (!uid || loading || greeted) return;
    if (messages.length === 0 && !conversation) {
      setGreeted(true);
    }
  }, [uid, loading, greeted, messages.length, conversation]);

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (!uid) return;
    void setSupportTyping(uid, 'customer', true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void setSupportTyping(uid, 'customer', false);
    }, 2000);
  };

  const addFromLibrary = async () => {
    try {
      const remaining = Math.max(0, 8 - pendingUris.length);
      if (!remaining) {
        showError('You can attach up to 8 photos.');
        return;
      }
      const uris = await pickSupportImagesFromLibrary(remaining);
      if (uris.length) setPendingUris((p) => [...p, ...uris].slice(0, 8));
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) showError(e.message);
      else showError(getReadableErrorMessageOr(e, 'Could not open photos.'));
    }
  };

  const addFromCamera = async () => {
    try {
      if (pendingUris.length >= 8) {
        showError('You can attach up to 8 photos.');
        return;
      }
      const uri = await takeSupportPhoto();
      if (uri) setPendingUris((p) => [...p, uri].slice(0, 8));
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) showError(e.message);
      else showError(getReadableErrorMessageOr(e, 'Could not open camera.'));
    }
  };

  const send = async (retryUris?: string[]) => {
    if (!uid || sendingLock.current) return;
    const uris = retryUris ?? pendingUris;
    const text = draft.trim();
    if (!text && uris.length === 0) return;

    sendingLock.current = true;
    setSending(true);
    setFailedIndexes([]);
    try {
      let attachments: SupportMessageAttachment[] = [];
      if (uris.length > 0) {
        attachments = await uploadSupportAttachments({
          userId: uid,
          conversationId: uid,
          localUris: uris,
          onItemProgress: (index, p) => {
            setUploadProgress((prev) => ({ ...prev, [index]: p.progress }));
          },
        });
      }
      await sendCustomerSupportMessage({
        body: text,
        attachments,
      });
      setDraft('');
      setPendingUris([]);
      setUploadProgress({});
      setFailedIndexes([]);
      void setSupportTyping(uid, 'customer', false);
      showSuccess('Message sent');
    } catch (e) {
      setFailedIndexes(uris.map((_, i) => i));
      showError(
        getReadableErrorMessageOr(
          e,
          'Could not send. Check your connection and tap retry on a photo, or Send again.',
        ),
      );
    } finally {
      setSending(false);
      sendingLock.current = false;
    }
  };

  const canSend = draft.trim().length > 0 || pendingUris.length > 0;

  const ticketLabel = useMemo(() => {
    if (!conversation) return null;
    return formatTicketNumber(conversation.referenceNumber, conversation.id);
  }, [conversation]);

  if (!uid) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => goBackFromProfileScreen(router)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Support</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>Sign in to chat with HalfOrder Support.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const showTyping = conversation?.adminTyping === true;
  const firstName = firstNameFromDisplayName(user?.displayName);
  const emptyGreeting = buildEmoSupportGreeting(firstName);

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
            <Ionicons name="checkmark-circle" size={16} color="#A855F7" />
          </View>
          {conversation && ticketLabel ? (
            <Text style={styles.headerSub}>
              Ticket {ticketLabel}
              {conversation.createdAtMs
                ? ` · ${formatCreatedShort(conversation.createdAtMs)}`
                : ''}
            </Text>
          ) : (
            <Text style={styles.headerSub}>Usually replies within a few hours</Text>
          )}
        </View>
      </View>

      {conversation ? (
        <View style={styles.statusBar}>
          <SupportStatusChip status={conversation.status} customerFacing />
          <Text style={styles.categoryPill}>
            {formatSupportCategory(conversation.complaintCategory)}
          </Text>
        </View>
      ) : null}

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
            <View style={styles.emptyHero}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles" size={28} color="#A855F7" />
              </View>
              <Text style={styles.emptyTitle}>We’re here to help</Text>
              <Text style={styles.emptyBody}>{emptyGreeting}</Text>
            </View>
            <Pressable
              style={styles.startComplaint}
              onPress={() => router.push('/complaint' as never)}
            >
              <Text style={styles.startComplaintText}>Start a guided request</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <MessageBubble
                item={item}
                prev={index > 0 ? messages[index - 1] : null}
                onRetry={() => void send(pendingUris)}
              />
            )}
            ListFooterComponent={
              showTyping ? (
                <View style={styles.typingRow}>
                  <View style={styles.typingBubble}>
                    <View style={styles.typingDot} />
                    <View style={[styles.typingDot, styles.typingDotMid]} />
                    <View style={styles.typingDot} />
                  </View>
                  <Text style={styles.typingText}>Support is typing…</Text>
                </View>
              ) : null
            }
          />
        )}

        {pendingUris.length > 0 ? (
          <View style={styles.pendingWrap}>
            <Text style={styles.pendingLabel}>
              {pendingUris.length} photo{pendingUris.length === 1 ? '' : 's'} ready to send
            </Text>
            <SupportImageGallery
              urls={[]}
              localUris={pendingUris}
              onRemoveLocal={(i) =>
                setPendingUris((prev) => prev.filter((_, idx) => idx !== i))
              }
              uploadProgressByIndex={uploadProgress}
              retryIndexes={failedIndexes}
              onRetry={() => void send(pendingUris)}
              compact
            />
          </View>
        ) : null}

        <View
          style={[
            styles.composerDock,
            { paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
          <View style={styles.composer}>
            <Pressable
              style={styles.attachBtn}
              onPress={() => setSheetOpen(true)}
              disabled={sending}
              accessibilityLabel="Add photos"
            >
              <Ionicons name="add" size={24} color="#FFF" />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Message…"
              placeholderTextColor="#7D8493"
              style={styles.input}
              multiline
              maxLength={4000}
            />
            <Pressable
              style={[styles.sendBtn, (!canSend || sending) && styles.sendBtnDisabled]}
              onPress={() => void send()}
              disabled={!canSend || sending}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#FFF" />
              )}
            </Pressable>
          </View>
          <Pressable
            style={styles.emailFooter}
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          >
            <Text style={styles.emailFooterText}>Email {SUPPORT_EMAIL}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SupportAttachmentSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCamera={() => void addFromCamera()}
        onLibrary={() => void addFromLibrary()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#09090B' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#09090B',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerAvatar: { width: 42, height: 42, borderRadius: 14 },
  headerMeta: { flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: {
    color: '#FAFAFA',
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  headerSub: { color: '#A1A1AA', fontSize: 12, marginTop: 3, fontWeight: '600' },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  categoryPill: {
    color: '#E4E4E7',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  muted: { color: '#A1A1AA', textAlign: 'center', fontSize: 15 },
  emptyWrap: { flex: 1, padding: 24, justifyContent: 'center', gap: 20 },
  emptyHero: { gap: 10 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(168,85,247,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#FAFAFA',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  emptyBody: {
    color: '#A1A1AA',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  startComplaint: {
    alignSelf: 'flex-start',
    backgroundColor: '#A855F7',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
  },
  startComplaintText: { color: '#FFF', fontWeight: '800' },
  list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 16 },
  daySep: { alignItems: 'center', marginVertical: 12 },
  daySepText: {
    color: '#71717A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 6,
  },
  bubbleCustomer: {
    alignSelf: 'flex-end',
    backgroundColor: '#A855F7',
    borderBottomRightRadius: 6,
  },
  bubbleSupport: {
    alignSelf: 'flex-start',
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 6,
  },
  systemBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.28)',
    borderRadius: 22,
    borderBottomLeftRadius: 6,
    padding: 14,
    marginBottom: 8,
  },
  complaintBubble: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(168,85,247,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.28)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  complaintLabel: {
    color: '#C4B5FD',
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emoLabel: {
    color: '#A855F7',
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  supportLabel: {
    color: '#C4B5FD',
    fontWeight: '700',
    fontSize: 11,
    marginBottom: 4,
  },
  bubbleBody: {
    color: '#FAFAFA',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  attachBlock: { marginTop: 8 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  bubbleTime: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
  },
  bubbleTimeOnPrimary: { color: 'rgba(255,255,255,0.72)' },
  readStatus: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '700',
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  retryText: { color: '#FBBF24', fontSize: 12, fontWeight: '700' },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#18181B',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A855F7',
    opacity: 0.45,
  },
  typingDotMid: { opacity: 0.85 },
  typingText: { color: '#A1A1AA', fontSize: 13, fontWeight: '600' },
  pendingWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0A0A0C',
    gap: 4,
  },
  pendingLabel: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  composerDock: {
    backgroundColor: '#0A0A0C',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#18181B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FAFAFA',
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
  sendBtnDisabled: { opacity: 0.4 },
  emailFooter: {
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emailFooterText: {
    color: '#52525B',
    fontSize: 11,
    fontWeight: '600',
  },
});
