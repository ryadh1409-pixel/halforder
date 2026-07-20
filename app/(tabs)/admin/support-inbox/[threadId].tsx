import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  adminReplySupportMessage,
  markSupportThreadReadByAdmin,
  subscribeSupportMessages,
  type SupportMessage,
} from '@/services/adminSupportInbox';
import { db } from '@/services/firebase';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminSupportThreadScreen() {
  const { threadId: threadParam } = useLocalSearchParams<{ threadId?: string }>();
  const threadId = typeof threadParam === 'string' ? threadParam : '';
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [meta, setMeta] = useState<{
    userName: string;
    userEmail: string | null;
    userId: string;
    orderId: string | null;
  } | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!threadId) return undefined;
    void markSupportThreadReadByAdmin(threadId).catch(() => {});
    const unsubMsg = subscribeSupportMessages(threadId, setMessages);
    const unsubMeta = onSnapshot(doc(db, 'adminSupportThreads', threadId), (snap) => {
      if (!snap.exists()) {
        setMeta(null);
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      setMeta({
        userName: typeof d.userName === 'string' ? d.userName : 'User',
        userEmail: typeof d.userEmail === 'string' ? d.userEmail : null,
        userId: typeof d.userId === 'string' ? d.userId : threadId,
        orderId: typeof d.orderId === 'string' ? d.orderId : null,
      });
    });
    return () => {
      unsubMsg();
      unsubMeta();
    };
  }, [threadId]);

  const send = async () => {
    if (!threadId || !draft.trim()) return;
    setSending(true);
    try {
      await adminReplySupportMessage(threadId, draft);
      setDraft('');
      showSuccess('Reply sent.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not send reply.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title={meta?.userName ?? 'Conversation'}
        subtitle={[meta?.userEmail, meta?.userId, meta?.orderId ? `Order ${meta.orderId}` : null]
          .filter(Boolean)
          .join(' · ')}
        fallbackRoute={adminRoutes.supportInbox}
      />
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.sender === 'admin' ? styles.bubbleAdmin : styles.bubbleUser,
            ]}
          >
            <Text style={styles.bubbleText}>{item.body}</Text>
            <Text style={styles.bubbleTime}>
              {item.sender === 'admin' ? 'Admin' : 'User'}
              {item.createdAtMs
                ? ` · ${new Date(item.createdAtMs).toLocaleString()}`
                : ''}
            </Text>
          </View>
        )}
      />
      <View style={styles.composer}>
        <AppTextInput
          value={draft}
          onChangeText={setDraft}
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
  list: { padding: 16, paddingBottom: 12 },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  bubbleUser: {
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
