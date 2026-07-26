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

function MessageBubble({
  item,
  onRetry,
}: {
  item: SupportConversationMessage;
  onRetry?: () => void;
}) {
  const isCustomer = item.sender === 'customer';
  const isSystem = item.sender === 'system' || item.kind === 'system';
  const isComplaint = item.kind === 'complaint';
  const urls = item.attachments.map((a) => a.url);

  if (isComplaint) {
    return (
      <View style={styles.complaintBubble}>
        <Text style={styles.complaintLabel}>Support request</Text>
        <Text style={styles.bubbleBody}>{item.body}</Text>
        {urls.length > 0 ? (
          <SupportImageGallery urls={urls} compact allowDownload={false} />
        ) : null}
        <Text style={styles.bubbleTime}>{formatMessageTime(item.createdAtMs)}</Text>
      </View>
    );
  }

  if (isSystem) {
    return (
      <View style={styles.systemBubble}>
        <Text style={styles.emoLabel}>Emo AI</Text>
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
      {!isCustomer ? (
        <Text style={styles.supportLabel}>HalfOrder Support</Text>
      ) : null}
      {item.body ? <Text style={styles.bubbleBody}>{item.body}</Text> : null}
      {urls.length > 0 ? (
        <SupportImageGallery urls={urls} compact />
      ) : null}
      {item.uploadFailed ? (
        <Pressable onPress={onRetry} style={styles.retryRow}>
          <Ionicons name="refresh" size={14} color="#FBBF24" />
          <Text style={styles.retryText}>Upload failed · Tap to retry</Text>
        </Pressable>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={styles.bubbleTime}>{formatMessageTime(item.createdAtMs)}</Text>
        {isCustomer ? (
          <Text style={styles.readStatus}>
            {item.readByAdmin ? 'Read' : 'Sent'}
          </Text>
        ) : null}
      </View>
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
  const [pendingUris, setPendingUris] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [failedIndexes, setFailedIndexes] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [greeted, setGreeted] = useState(false);
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
    if (!uid) return;
    const uris = retryUris ?? pendingUris;
    const text = draft.trim();
    if (!text && uris.length === 0) return;

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
      void setSupportTyping(uid, 'customer', false);
      showSuccess('Message sent');
    } catch (e) {
      setFailedIndexes(uris.map((_, i) => i));
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
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#A855F7" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          </View>
          <Text style={styles.headerSub}>
            {conversation?.referenceNumber
              ? `Ref ${conversation.referenceNumber}`
              : 'We typically reply within a few hours'}
          </Text>
        </View>
      </View>

      {conversation ? (
        <View style={styles.statusBar}>
          <SupportStatusChip status={conversation.status} />
          {conversation.complaintCategory ? (
            <Text style={styles.categoryPill}>{conversation.complaintCategory}</Text>
          ) : null}
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
            <View style={styles.greetBubble}>
              <Text style={styles.emoLabel}>Emo AI</Text>
              <Text style={styles.bubbleBody}>{emptyGreeting}</Text>
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
            renderItem={({ item }) => (
              <MessageBubble
                item={item}
                onRetry={() => void send(pendingUris)}
              />
            )}
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

        {pendingUris.length > 0 ? (
          <View style={styles.pendingWrap}>
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

        <View style={styles.composer}>
          <Pressable style={styles.attachBtn} onPress={() => setSheetOpen(true)}>
            <Ionicons name="add" size={24} color="#FFF" />
          </Pressable>
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
            style={[
              styles.sendBtn,
              (sending || (!draft.trim() && pendingUris.length === 0)) && { opacity: 0.5 },
            ]}
            onPress={() => void send()}
            disabled={sending || (!draft.trim() && pendingUris.length === 0)}
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
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  categoryPill: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#B7BDC9', textAlign: 'center', fontSize: 15 },
  emptyWrap: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 16,
  },
  greetBubble: {
    backgroundColor: '#171923',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  startComplaint: {
    alignSelf: 'flex-start',
    backgroundColor: '#A855F7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  startComplaintText: { color: '#FFF', fontWeight: '800' },
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
  systemBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
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
  emoLabel: {
    color: '#A855F7',
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  supportLabel: {
    color: '#C4B5FD',
    fontWeight: '700',
    fontSize: 11,
    marginBottom: 4,
  },
  bubbleBody: { color: '#FFF', fontSize: 15, lineHeight: 21, fontWeight: '500' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  bubbleTime: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
  },
  readStatus: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
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
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  typingText: { color: '#B7BDC9', fontSize: 13, fontWeight: '600' },
  pendingWrap: { paddingHorizontal: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
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
