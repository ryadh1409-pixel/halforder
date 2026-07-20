import { auth } from '@/services/firebase';
import { resolveFoodShareNotificationRoute } from '@/lib/foodShareNotificationRoutes';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { userSendSupportMessage } from '@/services/adminSupportInbox';
import {
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
  subscribeInboxNotifications,
  type InboxNotification,
} from '@/services/foodShareInbox';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatTimestamp(ms: number | null): string {
  if (ms == null) return 'Just now';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function iconForType(type: string): keyof typeof Ionicons.glyphMap {
  if (type.startsWith('admin_')) {
    if (type === 'admin_promotion') return 'pricetag';
    if (type === 'admin_maintenance') return 'construct';
    if (type === 'admin_alert') return 'warning';
    if (type === 'admin_feature') return 'rocket';
    if (type === 'admin_account') return 'person-circle';
    if (type === 'admin_announcement') return 'megaphone';
    return 'mail';
  }
  return 'notifications';
}

function NotificationRow({
  item,
  onPress,
}: {
  item: InboxNotification;
  onPress: () => void;
}) {
  const filled = iconForType(item.type);
  return (
    <Pressable
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={onPress}
    >
      <View style={styles.rowIcon}>
        <Ionicons
          name={filled}
          size={20}
          color={item.read ? '#B7BDC9' : '#A855F7'}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowBodyText} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.rowTime}>{formatTimestamp(item.createdAtMs)}</Text>
      </View>
      {!item.read ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? '';
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InboxNotification[]>([]);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportBody, setSupportBody] = useState('');
  const [supportBusy, setSupportBusy] = useState(false);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }
    return subscribeInboxNotifications(uid, (next) => {
      setRows(next);
      setLoading(false);
    });
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return undefined;
      void markAllInboxNotificationsRead(uid).catch(() => {
        /* best-effort — badge clears as docs update */
      });
      return undefined;
    }, [uid]),
  );

  const openNotification = async (item: InboxNotification) => {
    if (uid && !item.read) {
      try {
        await markInboxNotificationRead(uid, item.id);
      } catch {
        // Still navigate if mark-read fails.
      }
    }
    const href = resolveFoodShareNotificationRoute({
      type: item.type,
      deepLink: item.deepLink,
      matchId: item.matchId,
      adminFoodShareId: item.adminFoodShareId,
    });
    if (href === '/inbox' || String(item.type).startsWith('admin_')) {
      // Admin / inbox-native messages stay on this screen.
      return;
    }
    router.push(href as never);
  };

  const sendSupport = async () => {
    if (!supportBody.trim()) {
      showError('Enter a message for support.');
      return;
    }
    setSupportBusy(true);
    try {
      await userSendSupportMessage({ body: supportBody });
      setSupportBody('');
      setSupportOpen(false);
      showSuccess('Message sent to HalfOrder support.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not send message.'));
    } finally {
      setSupportBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={() => goBackFromProfileScreen(router)}
        >
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.title}>Inbox</Text>
        <Pressable
          style={styles.settings}
          onPress={() => setSupportOpen(true)}
          accessibilityLabel="Message Admin"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color="#FFF" />
        </Pressable>
      </View>

      <Pressable style={styles.supportBanner} onPress={() => setSupportOpen(true)}>
        <Ionicons name="headset-outline" size={18} color="#A855F7" />
        <Text style={styles.supportBannerText}>Message HalfOrder Support</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#A855F7" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="mail-open-outline" size={40} color="#7D8493" />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>
            Admin messages, announcements, promotions, and order updates appear
            here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <NotificationRow
              item={item}
              onPress={() => void openNotification(item)}
            />
          )}
        />
      )}

      <Modal visible={supportOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Message Admin</Text>
            <TextInput
              value={supportBody}
              onChangeText={setSupportBody}
              placeholder="How can we help?"
              placeholderTextColor="#7D8493"
              style={styles.modalInput}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setSupportOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSend, supportBusy && { opacity: 0.6 }]}
                onPress={() => void sendSupport()}
                disabled={supportBusy}
              >
                <Text style={styles.modalSendText}>
                  {supportBusy ? 'Sending…' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '900', flex: 1 },
  settings: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  supportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.28)',
  },
  supportBannerText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  center: {
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
  },
  list: { padding: 12, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  rowUnread: {
    backgroundColor: 'rgba(168,85,247,0.10)',
    borderColor: 'rgba(168,85,247,0.28)',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  rowBodyText: {
    color: '#B7BDC9',
    marginTop: 4,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  rowTime: {
    color: '#7D8493',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A855F7',
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#171923',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 12,
  },
  modalInput: {
    minHeight: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    color: '#FFF',
    backgroundColor: '#1C2030',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalCancel: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modalCancelText: { color: '#FFF', fontWeight: '700' },
  modalSend: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#A855F7',
  },
  modalSendText: { color: '#FFF', fontWeight: '800' },
});
